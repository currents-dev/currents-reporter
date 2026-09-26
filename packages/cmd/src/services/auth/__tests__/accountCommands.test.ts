import { mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const oauth = vi.hoisted(() => ({
  authorize: vi.fn(),
  refresh: vi.fn(),
  revoke: vi.fn(),
  canOpenBrowser: vi.fn(() => true),
}));
vi.mock('../oauth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../oauth')>()),
  ...oauth,
}));

import { OAuthLoginError } from '../oauth';
import {
  getValidCredentials,
  handleLogin,
  handleLogout,
  handleSignup,
  handleWhoami,
} from '../index';
import { CommandFailure, ExitCode } from '../result';

const API = 'http://api.test';
const SECOND_MS = 1000;

let configDir: string;
const credentialsFile = () => path.join(configDir, 'credentials.json');
const readFileJson = async () =>
  JSON.parse(await readFile(credentialsFile(), 'utf-8'));
const writeFileJson = (content: unknown) =>
  writeFile(credentialsFile(), JSON.stringify(content));
const fileExists = () =>
  readFile(credentialsFile()).then(
    () => true,
    () => false
  );

const json = (status: number, body: unknown, headers = {}) =>
  new Response(JSON.stringify(body), { status, headers });

type Route = (init?: RequestInit) => Response | Promise<Response>;

/** Answers by `METHOD path`; a route given an array answers in turn, then repeats the last. */
function stubApi(routes: Record<string, Route | Route[]>) {
  const fetchMock = vi.fn(async (input: string, init?: RequestInit) => {
    const { pathname, search } = new URL(input);
    const key = `${init?.method ?? 'GET'} ${pathname}${search}`;
    const route = routes[key];
    if (!route) throw new Error(`unexpected request ${key}`);
    const handler = Array.isArray(route)
      ? route.length > 1
        ? route.shift()!
        : route[0]
      : route;
    return handler(init);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const calls = (fetchMock: ReturnType<typeof stubApi>, key: string) =>
  fetchMock.mock.calls.filter(
    ([input, init]) =>
      `${init?.method ?? 'GET'} ${new URL(input).pathname}` === key
  );

/** Advances fake time until `promise` settles; file I/O runs on real time. */
async function settle<T>(promise: Promise<T>): Promise<T> {
  let done = false;
  promise.then(
    () => (done = true),
    () => (done = true)
  );
  while (!done) {
    await vi.advanceTimersByTimeAsync(SECOND_MS);
    await new Promise((resolve) => setImmediate(resolve));
  }
  return promise;
}

async function failureOf(promise: Promise<unknown>) {
  const result = await settle(promise).then(
    () => null,
    (e) => e
  );
  expect(result).toBeInstanceOf(CommandFailure);
  return result as CommandFailure;
}

const created = {
  poll_token: 'poll',
  code: 'AB23',
  expires_in: 1800,
  interval: 3,
};
const approved = {
  status: 'approved',
  api_key: 'crnts_pat_x',
  api_key_id: 'pat1',
  api_key_expires_at: '2026-10-26T00:00:00.000Z',
  org_id: 'org1',
  org_name: 'Acme',
};

const signup = (overrides: Partial<Parameters<typeof handleSignup>[0]> = {}) =>
  handleSignup({
    apiUrl: API,
    email: 'dana@acme.com',
    clientName: 'Claude Code',
    wait: true,
    onProgress: vi.fn(),
    ...overrides,
  });

const apiKeyLogin = (overrides = {}) => ({
  kind: 'api-key',
  apiUrl: API,
  apiKey: 'crnts_pat_x',
  apiKeyId: 'pat1',
  orgId: 'org1',
  orgName: 'Acme',
  createdAt: '2026-09-26T00:00:00.000Z',
  ...overrides,
});

beforeEach(async () => {
  configDir = await mkdtemp(path.join(os.tmpdir(), 'currents-auth-'));
  vi.stubEnv('CURRENTS_CONFIG_DIR', configDir);
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
  vi.setSystemTime(new Date('2026-09-26T00:00:00.000Z'));
  vi.clearAllMocks();
  oauth.canOpenBrowser.mockReturnValue(true);
});

afterEach(async () => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  await rm(configDir, { recursive: true, force: true });
});

describe('signup', () => {
  it('saves the request before the first poll, then stores the key', async () => {
    let savedAtFirstPoll: unknown;
    const fetchMock = stubApi({
      'POST /v1/signup-requests': () => json(202, created),
      'POST /v1/signup-requests/token': [
        async () => {
          savedAtFirstPoll = (await readFileJson()).pendingSignup;
          return json(200, { status: 'pending' });
        },
        () => json(200, approved),
      ],
    });

    const result = await settle(signup({ orgName: 'Acme QA' }));

    expect(savedAtFirstPoll).toMatchObject({
      apiUrl: API,
      email: 'dana@acme.com',
      pollToken: 'poll',
      code: 'AB23',
    });
    expect(result.exitCode).toBeUndefined();
    expect(result.data).toMatchObject({
      status: 'approved',
      org: { id: 'org1', name: 'Acme' },
      api_key_expires_at: '2026-10-26T00:00:00.000Z',
    });
    expect(result.nextSteps?.map((s) => s.command)).toEqual([
      'currents whoami',
      'currents setup --project-name <name>',
    ]);
    const file = await readFileJson();
    expect(file.pendingSignup).toBeUndefined();
    expect(file.login).toMatchObject({
      kind: 'api-key',
      apiKey: 'crnts_pat_x',
      apiKeyId: 'pat1',
      expiresAt: '2026-10-26T00:00:00.000Z',
    });
    expect(
      JSON.parse(
        calls(fetchMock, 'POST /v1/signup-requests')[0][1]!.body as string
      )
    ).toEqual({
      email: 'dana@acme.com',
      client_name: 'Claude Code',
      org_name: 'Acme QA',
    });
  });

  it('shows the email with part of it hidden', async () => {
    stubApi({ 'POST /v1/signup-requests': () => json(202, created) });
    const onProgress = vi.fn();

    const result = await settle(signup({ wait: false, onProgress }));

    expect(result.data).toMatchObject({ email: 'da***@acme.com' });
    expect(JSON.stringify(result)).not.toContain('dana@');
  });

  it('with --no-wait, exits 2 without polling and keeps the request', async () => {
    const fetchMock = stubApi({
      'POST /v1/signup-requests': () => json(202, created),
    });

    const result = await settle(signup({ wait: false }));

    expect(result.exitCode).toBe(ExitCode.waitingForPerson);
    expect(result.data).toMatchObject({ status: 'waiting', code: 'AB23' });
    expect(result.nextSteps?.[0].command).toBe('currents signup --resume');
    expect(calls(fetchMock, 'POST /v1/signup-requests/token')).toHaveLength(0);
    expect((await readFileJson()).pendingSignup.pollToken).toBe('poll');
  });

  it('with --timeout, exits 2 and keeps the request for --resume', async () => {
    stubApi({
      'POST /v1/signup-requests': () => json(202, created),
      'POST /v1/signup-requests/token': () => json(200, { status: 'pending' }),
    });

    const result = await settle(signup({ timeoutSeconds: 10 }));

    expect(result.exitCode).toBe(ExitCode.waitingForPerson);
    expect((await readFileJson()).pendingSignup.pollToken).toBe('poll');
  });

  it('with --resume, collects the key of the saved request', async () => {
    stubApi({
      'POST /v1/signup-requests': () => json(202, created),
    });
    await settle(signup({ wait: false }));
    const fetchMock = stubApi({
      'POST /v1/signup-requests/token': () => json(200, approved),
    });

    const result = await settle(signup({ email: undefined, resume: true }));

    expect(result.data).toMatchObject({ status: 'approved' });
    expect(calls(fetchMock, 'POST /v1/signup-requests/token')).toHaveLength(1);
  });

  it('with --resume and nothing saved, exits 3', async () => {
    stubApi({});
    const failure = await failureOf(signup({ email: undefined, resume: true }));
    expect(failure).toMatchObject({
      code: 'no_pending_signup',
      exitCode: ExitCode.notLoggedIn,
    });
  });

  it('with --resume after the request expired, answers expired without polling', async () => {
    stubApi({ 'POST /v1/signup-requests': () => json(202, created) });
    await settle(signup({ wait: false }));
    vi.setSystemTime(new Date('2026-09-26T01:00:00.000Z'));
    const fetchMock = stubApi({});

    const failure = await failureOf(signup({ email: undefined, resume: true }));

    expect(failure).toMatchObject({
      code: 'expired',
      exitCode: ExitCode.waitingForPerson,
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await fileExists()).toBe(false);
  });

  it('with --resend, sends the email again and then waits', async () => {
    stubApi({ 'POST /v1/signup-requests': () => json(202, created) });
    await settle(signup({ wait: false }));
    stubApi({
      'POST /v1/signup-requests/resend': () =>
        json(202, { status: 'sent', expires_in: 1700 }),
      'POST /v1/signup-requests/token': () => json(200, approved),
    });
    const onProgress = vi.fn();

    const result = await settle(
      signup({ email: undefined, resend: true, onProgress })
    );

    expect(onProgress).toHaveBeenCalledWith(expect.stringContaining('again'), {
      status: 'resent',
    });
    expect(result.data).toMatchObject({ status: 'approved' });
  });

  it('with --resend on an expired request, exits 2 and forgets it', async () => {
    stubApi({ 'POST /v1/signup-requests': () => json(202, created) });
    await settle(signup({ wait: false }));
    stubApi({
      'POST /v1/signup-requests/resend': () => json(410, { status: 'expired' }),
    });

    const failure = await failureOf(signup({ email: undefined, resend: true }));

    expect(failure.code).toBe('expired');
    expect(await fileExists()).toBe(false);
  });

  it('changes nothing when already logged in to the same API', async () => {
    await writeFileJson({ login: apiKeyLogin() });
    const fetchMock = stubApi({});

    const result = await settle(signup());

    expect(result.data).toMatchObject({ status: 'already_logged_in' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('with --force, signs up despite a stored login', async () => {
    await writeFileJson({ login: apiKeyLogin() });
    const fetchMock = stubApi({
      'POST /v1/signup-requests': () => json(202, created),
    });

    await settle(signup({ force: true, wait: false }));

    expect(calls(fetchMock, 'POST /v1/signup-requests')).toHaveLength(1);
  });

  it('exits 5 for an existing account and forgets the request', async () => {
    stubApi({
      'POST /v1/signup-requests': () => json(202, created),
      'POST /v1/signup-requests/token': () =>
        json(200, { status: 'existing_account' }),
    });

    const failure = await failureOf(signup());

    expect(failure).toMatchObject({
      code: 'account_exists',
      exitCode: ExitCode.accountExists,
    });
    expect(failure.nextSteps[0].command).toBe('currents login');
    expect(await fileExists()).toBe(false);
  });

  it('exits 2 for a key already collected elsewhere', async () => {
    stubApi({
      'POST /v1/signup-requests': () => json(202, created),
      'POST /v1/signup-requests/token': () => json(410, { status: 'consumed' }),
    });

    const failure = await failureOf(signup());

    expect(failure).toMatchObject({
      code: 'consumed',
      exitCode: ExitCode.waitingForPerson,
    });
  });

  it('exits 4 when the owner revoked the key before it was collected', async () => {
    stubApi({
      'POST /v1/signup-requests': () => json(202, created),
      'POST /v1/signup-requests/token': () => json(410, { status: 'revoked' }),
    });

    const failure = await failureOf(signup());

    expect(failure).toMatchObject({
      code: 'revoked',
      exitCode: ExitCode.refused,
    });
    expect(await fileExists()).toBe(false);
  });

  it.each([
    [json(400, { error: 'email_not_allowed' }), 'email_not_allowed', undefined],
    [
      json(429, { error: 'rate_limited' }, { 'Retry-After': '120' }),
      'rate_limited',
      'Try again in 2 min.',
    ],
  ])('exits 4 when the API refuses: %#', async (response, code, hint) => {
    stubApi({ 'POST /v1/signup-requests': () => response });

    const failure = await failureOf(signup());

    expect(failure).toMatchObject({ code, exitCode: ExitCode.refused, hint });
    expect(await fileExists()).toBe(false);
  });

  it('requires --email without --resume', async () => {
    stubApi({});
    const failure = await failureOf(signup({ email: undefined }));
    expect(failure.code).toBe('invalid_arguments');
  });
});

const me = (overrides: Record<string, unknown> = {}) => ({
  org: { id: 'org1', name: 'Acme' },
  user: { id: 'u1', email: 'dana@acme.com', role: 'admin' },
  credential: {
    kind: 'personal_access_token',
    id: 'pat1',
    scopes: ['projects:read', 'projects:write', 'results:read'],
    expires_at: '2026-10-26T00:00:00.000Z',
  },
  ...overrides,
});

describe('whoami', () => {
  it('describes the login from the API and suggests a first project', async () => {
    await writeFileJson({ login: apiKeyLogin() });
    stubApi({
      'GET /v1/me': () => json(200, { status: 'OK', data: me() }),
      'GET /v1/projects?limit=5': () =>
        json(200, { status: 'OK', data: [], has_more: false }),
    });

    const result = await handleWhoami();

    expect(result.data).toEqual({
      api_url: API,
      org: { id: 'org1', name: 'Acme' },
      user: { id: 'u1', email: 'dana@acme.com', role: 'admin' },
      credential: me().credential,
      expires_in_days: 30,
      projects: { sample: [], has_more: false },
    });
    expect(result.nextSteps?.map((s) => s.command)).toEqual([
      'currents setup --project-name <name>',
    ]);
  });

  it('warns when the login expires within 7 days', async () => {
    await writeFileJson({ login: apiKeyLogin() });
    stubApi({
      'GET /v1/me': () =>
        json(200, {
          status: 'OK',
          data: me({
            credential: {
              ...me().credential,
              expires_at: '2026-09-29T00:00:00.000Z',
            },
          }),
        }),
      'GET /v1/projects?limit=5': () =>
        json(200, {
          status: 'OK',
          data: [{ projectId: 'p1', name: 'web' }],
        }),
    });

    const result = await handleWhoami();

    expect(result.data.expires_in_days).toBe(3);
    expect(result.nextSteps).toEqual([
      expect.objectContaining({
        command: 'currents login',
        why: expect.stringContaining('3 days'),
      }),
    ]);
  });

  it('skips projects for a login without projects:read', async () => {
    await writeFileJson({ login: apiKeyLogin() });
    const fetchMock = stubApi({
      'GET /v1/me': () =>
        json(200, {
          status: 'OK',
          data: me({
            credential: { ...me().credential, scopes: ['results:read'] },
          }),
        }),
    });

    const result = await handleWhoami();

    expect(result.data.projects).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('exits 3 and keeps the file when the API refuses the key', async () => {
    await writeFileJson({ login: apiKeyLogin() });
    stubApi({ 'GET /v1/me': () => json(401, { message: 'Unauthorized' }) });

    const failure = await failureOf(handleWhoami());

    expect(failure).toMatchObject({
      code: 'invalid_credentials',
      exitCode: ExitCode.notLoggedIn,
    });
    expect(await fileExists()).toBe(true);
  });

  it('fails as unexpected and keeps the file when the API is unreachable', async () => {
    await writeFileJson({ login: apiKeyLogin() });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('ECONNREFUSED');
      })
    );

    await expect(handleWhoami()).rejects.not.toBeInstanceOf(CommandFailure);
    expect(await fileExists()).toBe(true);
  });

  it('exits 3 without a login', async () => {
    const failure = await failureOf(handleWhoami());
    expect(failure).toMatchObject({
      code: 'not_logged_in',
      exitCode: ExitCode.notLoggedIn,
    });
  });
});

describe('logout', () => {
  it('revokes a signup key through the API and deletes the file', async () => {
    await writeFileJson({ login: apiKeyLogin() });
    const fetchMock = stubApi({
      'DELETE /v1/me/credential': () =>
        json(200, { status: 'OK', data: { id: 'pat1', revoked: true } }),
    });

    const result = await handleLogout({});

    expect(result.data).toEqual({ status: 'logged_out', revoked: true });
    expect(
      calls(fetchMock, 'DELETE /v1/me/credential')[0][1]!.headers
    ).toMatchObject({ Authorization: 'Bearer crnts_pat_x' });
    expect(await fileExists()).toBe(false);
  });

  it('deletes the file even when revoking fails', async () => {
    await writeFileJson({ login: apiKeyLogin() });
    stubApi({ 'DELETE /v1/me/credential': () => json(500, {}) });

    const result = await handleLogout({});

    expect(result.data).toEqual({ status: 'logged_out', revoked: false });
    expect(result.text.join('\n')).toContain('Personal Access Tokens');
    expect(await fileExists()).toBe(false);
  });

  it('counts a key the API already refuses as revoked', async () => {
    await writeFileJson({ login: apiKeyLogin() });
    stubApi({ 'DELETE /v1/me/credential': () => json(401, {}) });

    const result = await handleLogout({});

    expect(result.data.revoked).toBe(true);
  });

  it('revokes an OAuth login at the authorization server', async () => {
    const login = {
      kind: 'oauth',
      apiUrl: API,
      accessToken: 'at',
      refreshToken: 'rt',
      expiresAt: Date.now() + 3600_000,
    };
    await writeFileJson({ login });
    const fetchMock = stubApi({});

    const result = await handleLogout({});

    expect(oauth.revoke).toHaveBeenCalledWith(login);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.data.revoked).toBe(true);
  });

  it('with --keep-remote, only deletes the file', async () => {
    await writeFileJson({ login: apiKeyLogin() });
    const fetchMock = stubApi({});

    const result = await handleLogout({ keepRemote: true });

    expect(result.data.revoked).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await fileExists()).toBe(false);
  });

  it('discards a pending signup and exits 0 when not logged in', async () => {
    await writeFileJson({
      pendingSignup: {
        apiUrl: API,
        email: 'dana@acme.com',
        pollToken: 'poll',
        code: 'AB23',
        interval: 3,
        expiresAt: '2026-09-26T00:30:00.000Z',
      },
    });

    const result = await handleLogout({});

    expect(result.data.status).toBe('not_logged_in');
    expect(result.exitCode).toBeUndefined();
    expect(await fileExists()).toBe(false);
  });
});

describe('login', () => {
  const tokens = {
    kind: 'oauth',
    apiUrl: API,
    accessToken: 'at',
    refreshToken: 'rt',
    expiresAt: Date.now() + 3600_000,
    scope: 'openid projects:read',
    orgId: 'org1',
  };
  const login = (overrides = {}) =>
    handleLogin({
      apiUrl: API,
      browser: true,
      onProgress: vi.fn(),
      ...overrides,
    });

  it('stores the login and reports its scopes', async () => {
    oauth.authorize.mockResolvedValue(tokens);

    const result = await login();

    expect(result.data).toMatchObject({
      status: 'logged_in',
      org_id: 'org1',
      scopes: ['openid', 'projects:read'],
    });
    expect((await readFileJson()).login).toEqual(tokens);
  });

  it('prints the link instead of opening a browser that cannot be seen', async () => {
    oauth.canOpenBrowser.mockReturnValue(false);
    oauth.authorize.mockImplementation(async ({ onUrl }) => {
      onUrl('http://auth/authorize?x=1');
      return tokens;
    });
    const onProgress = vi.fn();

    await login({ onProgress });

    expect(oauth.authorize).toHaveBeenCalledWith(
      expect.objectContaining({ browser: false })
    );
    expect(onProgress).toHaveBeenCalledWith(
      expect.stringContaining('Open this link'),
      { status: 'waiting', url: 'http://auth/authorize?x=1' }
    );
  });

  it('passes --timeout through in milliseconds', async () => {
    oauth.authorize.mockResolvedValue(tokens);
    await login({ timeoutSeconds: 30 });
    expect(oauth.authorize).toHaveBeenCalledWith(
      expect.objectContaining({ timeoutMs: 30_000 })
    );
  });

  it('changes nothing when already logged in to the same API', async () => {
    await writeFileJson({ login: apiKeyLogin() });
    const result = await login();
    expect(result.data).toMatchObject({ status: 'already_logged_in' });
    expect(oauth.authorize).not.toHaveBeenCalled();
  });

  it('logs in again when the stored signup key has expired', async () => {
    await writeFileJson({
      login: apiKeyLogin({ expiresAt: '2026-09-01T00:00:00.000Z' }),
    });
    oauth.authorize.mockResolvedValue(tokens);
    await login();
    expect(oauth.authorize).toHaveBeenCalled();
  });

  it.each([
    ['access_denied', ExitCode.notLoggedIn],
    ['timeout', ExitCode.waitingForPerson],
  ] as const)('maps %s to exit code %i', async (code, exitCode) => {
    oauth.authorize.mockRejectedValue(new OAuthLoginError(code, 'no'));
    const failure = await failureOf(login());
    expect(failure).toMatchObject({ code, exitCode });
  });
});

describe('getValidCredentials', () => {
  it('exits 3 when the refresh token is refused', async () => {
    await writeFileJson({
      login: {
        kind: 'oauth',
        apiUrl: API,
        accessToken: 'at',
        refreshToken: 'rt',
        expiresAt: Date.now(),
      },
    });
    oauth.refresh.mockRejectedValue(
      new OAuthLoginError('session_expired', 'expired')
    );

    const failure = await failureOf(getValidCredentials());

    expect(failure).toMatchObject({
      code: 'session_expired',
      exitCode: ExitCode.notLoggedIn,
    });
  });

  it('stores the refreshed token', async () => {
    await writeFileJson({
      login: {
        kind: 'oauth',
        apiUrl: API,
        accessToken: 'old',
        refreshToken: 'rt',
        expiresAt: Date.now(),
      },
    });
    oauth.refresh.mockResolvedValue({
      kind: 'oauth',
      apiUrl: API,
      accessToken: 'new',
      refreshToken: 'rt2',
      expiresAt: Date.now() + 3600_000,
    });

    await getValidCredentials();

    expect((await readFileJson()).login.accessToken).toBe('new');
  });
});
