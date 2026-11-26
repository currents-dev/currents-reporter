import { createHash } from 'crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  ApiServer,
  RecordedRequest,
  Response,
  startApiServer,
} from '../../../test-utils/api-server';
import {
  assertOwnEndpoint,
  authorize,
  canOpenBrowser,
  OAuthLoginError,
  refresh,
  SCOPES,
} from '../oauth';

let server: ApiServer;
let metadata: Record<string, string>;
let tokenResponse: (request: RecordedRequest) => Response;
const RESOURCE = 'https://api.test';

beforeAll(async () => {
  server = await startApiServer((request) => {
    if (request.url === '/.well-known/oauth-authorization-server') {
      return { status: 200, json: metadata };
    }
    if (request.url === '/.well-known/oauth-protected-resource') {
      return { status: 200, json: { resource: RESOURCE } };
    }
    if (request.url === '/token') return tokenResponse(request);
    return { status: 404 };
  });
});

afterAll(() => server.close());

beforeEach(() => {
  server.requests.length = 0;
  metadata = {
    issuer: 'https://id.test',
    authorization_endpoint: `${server.url}/authorize`,
    token_endpoint: `${server.url}/token`,
  };
  tokenResponse = () => ({
    status: 200,
    json: {
      access_token: 'at',
      refresh_token: 'rt',
      expires_in: 3600,
      scope: SCOPES,
    },
  });
});

const tokenForm = () =>
  new URLSearchParams(
    server.requests.find((r) => r.url === '/token')!.body.toString()
  );

/** Plays the browser: calls the loopback redirect with what `answer` returns. */
const respondWith =
  (answer: (params: URLSearchParams) => Record<string, string>) =>
  (url: string) => {
    const params = new URL(url).searchParams;
    const callback = new URL(params.get('redirect_uri')!);
    for (const [key, value] of Object.entries(answer(params))) {
      callback.searchParams.set(key, value);
    }
    void fetch(callback);
  };

describe('canOpenBrowser', () => {
  it.each([
    [{}, 'darwin', true],
    [{ SSH_CONNECTION: '1 2 3 4' }, 'darwin', false],
    [{}, 'linux', false],
    [{ DISPLAY: ':0' }, 'linux', true],
    [{ WAYLAND_DISPLAY: 'wayland-0' }, 'linux', true],
    [{ DISPLAY: ':0', SSH_TTY: '/dev/pts/0' }, 'linux', false],
  ] as const)('%o on %s → %s', (env, platform, expected) => {
    expect(canOpenBrowser(env, platform)).toBe(expected);
  });
});

describe('assertOwnEndpoint', () => {
  it.each([
    ['https://api.currents.dev/api/auth/oauth2/token', true],
    ['https://evil.test/token', false],
    ['http://api.currents.dev/token', false],
  ])('%s → %s', (endpoint, allowed) => {
    const check = () =>
      assertOwnEndpoint('https://api.currents.dev', endpoint, 'token_endpoint');
    if (allowed) expect(check).not.toThrow();
    else expect(check).toThrow(/not the API's own HTTPS origin/);
  });

  it('allows http on a loopback address', () => {
    expect(() =>
      assertOwnEndpoint(
        'http://localhost:4000',
        'http://localhost:4000/token',
        'token_endpoint'
      )
    ).not.toThrow();
  });
});

describe('authorize', () => {
  it('asks for the scopes and resource of the API and exchanges the code with the PKCE verifier', async () => {
    let authorizeParams = new URLSearchParams();

    const credentials = await authorize({
      apiUrl: server.url,
      browser: false,
      onUrl: respondWith((params) => {
        authorizeParams = params;
        return {
          code: 'c1',
          state: params.get('state')!,
          iss: 'https://id.test',
        };
      }),
    });

    expect(authorizeParams.get('client_id')).toBe('currents-cli');
    expect(authorizeParams.get('scope')).toBe(
      'openid offline_access projects:read results:read'
    );
    expect(authorizeParams.get('resource')).toBe(RESOURCE);
    expect(authorizeParams.get('code_challenge_method')).toBe('S256');
    const form = tokenForm();
    expect(form.get('grant_type')).toBe('authorization_code');
    expect(form.get('code')).toBe('c1');
    expect(form.get('resource')).toBe(RESOURCE);
    expect(form.get('redirect_uri')).toBe(authorizeParams.get('redirect_uri'));
    expect(
      createHash('sha256')
        .update(form.get('code_verifier')!)
        .digest('base64url')
    ).toBe(authorizeParams.get('code_challenge'));
    expect(credentials).toMatchObject({
      apiUrl: server.url,
      accessToken: 'at',
      refreshToken: 'rt',
      scope: SCOPES,
    });
  });

  it('ignores a callback without its state', async () => {
    let strayStatus = 0;
    const credentials = await authorize({
      apiUrl: server.url,
      browser: false,
      onUrl: (url) => {
        const params = new URL(url).searchParams;
        const callback = new URL(params.get('redirect_uri')!);
        void (async () => {
          callback.searchParams.set('code', 'stray');
          callback.searchParams.set('state', 'other');
          strayStatus = (await fetch(callback)).status;
          callback.searchParams.set('code', 'real');
          callback.searchParams.set('state', params.get('state')!);
          await fetch(callback);
        })();
      },
    });

    expect(strayStatus).toBe(400);
    expect(tokenForm().get('code')).toBe('real');
    expect(credentials.accessToken).toBe('at');
  });

  it('refuses an authorization endpoint on another origin before printing the link', async () => {
    metadata.authorization_endpoint = 'https://evil.test/authorize';
    let printed = false;

    await expect(
      authorize({
        apiUrl: server.url,
        browser: false,
        onUrl: () => (printed = true),
      })
    ).rejects.toThrow(/authorization_endpoint at https:\/\/evil\.test/);
    expect(printed).toBe(false);
  });

  it('refuses a response from another issuer', async () => {
    await expect(
      authorize({
        apiUrl: server.url,
        browser: false,
        onUrl: respondWith((params) => ({
          code: 'c1',
          state: params.get('state')!,
          iss: 'https://evil.test',
        })),
      })
    ).rejects.toThrow(/issuer https:\/\/evil\.test/);
    expect(server.requests.some((r) => r.url === '/token')).toBe(false);
  });

  it('reports a refusal without control characters', async () => {
    await expect(
      authorize({
        apiUrl: server.url,
        browser: false,
        onUrl: respondWith((params) => ({
          error: 'access_denied',
          error_description: 'no\u001b[2Jthanks',
          state: params.get('state')!,
        })),
      })
    ).rejects.toThrow('Authorization refused: access_denied no[2Jthanks');
  });

  it('times out', async () => {
    await expect(
      authorize({
        apiUrl: server.url,
        browser: false,
        onUrl: () => {},
        timeoutMs: 50,
      })
    ).rejects.toThrow(/Timed out/);
  });

  it('does not repeat the code in a token error', async () => {
    tokenResponse = () => ({
      status: 400,
      json: { error: 'invalid_grant', error_description: 'bad code sec-123' },
    });

    const error = await authorize({
      apiUrl: server.url,
      browser: false,
      onUrl: respondWith((params) => ({
        code: 'sec-123',
        state: params.get('state')!,
      })),
    }).catch((e) => e);

    expect(error).toBeInstanceOf(OAuthLoginError);
    expect(error.message).toBe(
      '/token answered HTTP 400: invalid_grant bad code *****'
    );
  });
});

describe('refresh', () => {
  const stored = {
    apiUrl: '',
    accessToken: 'old',
    refreshToken: 'old-rt',
    expiresAt: 0,
    scope: SCOPES,
  };

  it('sends the refresh token with the resource and keeps it when no new one comes back', async () => {
    tokenResponse = () => ({
      status: 200,
      json: { access_token: 'new', expires_in: 60 },
    });

    const credentials = await refresh({ ...stored, apiUrl: server.url });

    const form = tokenForm();
    expect(form.get('grant_type')).toBe('refresh_token');
    expect(form.get('refresh_token')).toBe('old-rt');
    expect(form.get('resource')).toBe(RESOURCE);
    expect(credentials).toMatchObject({
      accessToken: 'new',
      refreshToken: 'old-rt',
      scope: SCOPES,
    });
    expect(credentials.expiresAt).toBeGreaterThan(Date.now());
  });

  it('fails with OAuthLoginError when the refresh token is refused', async () => {
    tokenResponse = () => ({ status: 400, json: { error: 'invalid_grant' } });

    await expect(
      refresh({ ...stored, apiUrl: server.url })
    ).rejects.toBeInstanceOf(OAuthLoginError);
  });
});
