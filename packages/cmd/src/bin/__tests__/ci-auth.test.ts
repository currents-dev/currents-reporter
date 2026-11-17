import { Readable } from 'node:stream';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
// @ts-ignore
import { disable as disableDebug } from 'debug';
import { setOidcAudienceOption } from '../../http/httpConfig';
import { maskInGitHubLog } from '../../lib/oidc';
import {
  ApiServer,
  RecordedRequest,
  Response,
  startApiServer,
} from '../../test-utils/api-server';
import { getProgram } from '../program';

// The retry delays are 3s to 30s.
vi.mock('../../http/httpRetry', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../http/httpRetry')>()),
  getDelay: () => 1,
}));

class ExitError extends Error {
  constructor(public code: number | undefined) {
    super(`exit ${code}`);
  }
}

const NOW = new Date('2026-11-17T12:00:00.000Z');
const EXPIRES_AT = '2026-11-17T12:10:00.000Z';
// The characters change when the token is URL-encoded.
const JWT = 'provider/jwt+1=';
const API_TOKEN = 'crnts_ciapi_test';
const RECORD_KEY = 'crnts_ci_test';
const REQUEST_SECRET = 'request-secret';

const exchangeResponse = (credential: string, scope?: string): Response => ({
  status: 200,
  json: {
    access_token: credential,
    issued_token_type: 'urn:ietf:params:oauth:token-type:access_token',
    token_type: 'Bearer',
    expires_in: 600,
    ...(scope === undefined ? {} : { scope }),
  },
});

const formBody = (request: RecordedRequest) =>
  Object.fromEntries(new URLSearchParams(request.body.toString()));

const MASK_LINE = /^::add-mask::.*\n?/gm;

describe('currents ci auth', () => {
  let server: ApiServer;
  let redirectTarget: ApiServer;
  let responses: Record<string, Response[]>;
  // stdout, stderr and the requests the server got, in order.
  let trace: string[];
  let stdout: string;
  let stderr: string;

  const requestsTo = (path: string) =>
    server.requests.filter((r) => r.url.split('?')[0] === path);
  const githubAudiences = () =>
    requestsTo('/github-token').map((r) =>
      new URL(r.url, server.url).searchParams.get('audience')
    );
  /**
   * stderr without the GitHub mask commands, which hold the secrets on purpose,
   * and without the debug line of the HTTP retry check, which prints the error
   * body of every request as the server sent it.
   */
  const diagnostics = () =>
    stderr.replace(MASK_LINE, '').replace(/^.*isRetriableError.*$/gm, '');
  const secretsIn = (text: string) =>
    [JWT, API_TOKEN, RECORD_KEY, REQUEST_SECRET, 'configured-key']
      .flatMap((secret) => [secret, encodeURIComponent(secret)])
      .filter((secret) => text.includes(secret));

  const defaultResponse = (path: string): Response => {
    if (path === '/github-token') return { status: 200, json: { value: JWT } };
    if (path === '/oidc/api/token') {
      return exchangeResponse(API_TOKEN, 'runs:read projects:read');
    }
    if (path === '/oidc/token') return exchangeResponse(RECORD_KEY);
    if (path === '/oidc/api/revoke' || path === '/oidc/revoke') {
      return { status: 200 };
    }
    return { status: 404 };
  };

  beforeAll(async () => {
    server = await startApiServer((request) => {
      const path = request.url.split('?')[0];
      trace.push(`request ${path}`);
      return responses[path]?.shift() ?? defaultResponse(path);
    });
    // The HTTP client reads the base URL once, when it is first used.
    process.env.CURRENTS_API_URL = server.url;
    redirectTarget = await startApiServer(() => ({ status: 200 }));
  });

  afterAll(async () => {
    delete process.env.CURRENTS_API_URL;
    await server.close();
    await redirectTarget.close();
  });

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    server.requests.length = 0;
    redirectTarget.requests.length = 0;
    responses = {};
    trace = [];
    stdout = '';
    stderr = '';
    setOidcAudienceOption(undefined);
    for (const name of [
      'CURRENTS_API_KEY',
      'CURRENTS_RECORD_KEY',
      'CURRENTS_PROJECT_ID',
      'CURRENTS_DEBUG',
      'CURRENTS_OIDC_TOKEN',
      'CURRENTS_OIDC_API_TOKEN',
      'CURRENTS_OIDC_AUDIENCE',
      'CURRENTS_OIDC_API_AUDIENCE',
      'ACTIONS_ID_TOKEN_REQUEST_URL',
      'ACTIONS_ID_TOKEN_REQUEST_TOKEN',
      'GITHUB_ACTIONS',
    ]) {
      vi.stubEnv(name, undefined);
    }
    vi.stubEnv('CURRENTS_PROJECT_ID', 'p1');
    vi.spyOn(process.stdout, 'write').mockImplementation(((
      chunk: unknown,
      ...rest: unknown[]
    ) => {
      stdout += String(chunk);
      trace.push(`stdout ${String(chunk)}`);
      const callback = rest.find((arg) => typeof arg === 'function');
      (callback as (() => void) | undefined)?.();
      return true;
    }) as never);
    vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
      stderr += String(chunk);
      trace.push(`stderr ${String(chunk)}`);
      return true;
    });
    vi.spyOn(console, 'log').mockImplementation((...args) => {
      stdout += args.join(' ');
    });
    vi.spyOn(console, 'error').mockImplementation((...args) => {
      stderr += `${args.join(' ')}\n`;
    });
    vi.spyOn(console, 'warn').mockImplementation((...args) => {
      stderr += `${args.join(' ')}\n`;
    });
    vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new ExitError(code);
    }) as never);
  });

  afterEach(() => {
    disableDebug();
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  const setGitHubEnv = () => {
    vi.stubEnv('GITHUB_ACTIONS', 'true');
    vi.stubEnv(
      'ACTIONS_ID_TOKEN_REQUEST_URL',
      `${server.url}/github-token?api-version=2.0`
    );
    vi.stubEnv('ACTIONS_ID_TOKEN_REQUEST_TOKEN', REQUEST_SECRET);
  };

  const setStdin = (text: string) =>
    vi
      .spyOn(process, 'stdin', 'get')
      .mockReturnValue(Readable.from([text]) as never);

  async function run(args: string[]) {
    try {
      await getProgram().parseAsync(['ci', 'auth', ...args], { from: 'user' });
    } catch (e) {
      if (!(e instanceof ExitError)) throw e;
      return e.code;
    }
    return undefined;
  }

  /** Exit 1, nothing on stdout, and no secret in the diagnostics. */
  const expectFailure = (code: number | undefined) => {
    expect(code).toBe(1);
    expect(stdout).toBe('');
    expect(secretsIn(diagnostics())).toEqual([]);
  };

  const exchangeFailures: [string, Response[]][] = [
    [
      'an OAuth error that repeats the token',
      [
        {
          status: 400,
          json: {
            error: 'invalid_grant',
            error_description: `bad token ${JWT} ${encodeURIComponent(JWT)}`,
          },
        },
      ],
    ],
    ['a response without a token', [{ status: 200, json: { expires_in: 1 } }]],
    [
      'a response without an expiry',
      [{ status: 200, json: { access_token: API_TOKEN } }],
    ],
    ['a closed connection, every time', Array(5).fill({ destroy: true })],
    ['503, every time', Array(5).fill({ status: 503 })],
    [
      'a redirect',
      [{ status: 307, headers: { location: 'REDIRECT' }, body: '' }],
    ],
  ];
  const withRedirectTarget = (list: Response[]) =>
    list.map((r) =>
      'headers' in r && r.headers?.location === 'REDIRECT'
        ? { ...r, headers: { location: `${redirectTarget.url}/oidc` } }
        : r
    );

  describe('exchange', () => {
    it.each([
      ['api', '/oidc/api/token', '/oidc/token', API_TOKEN],
      ['record', '/oidc/token', '/oidc/api/token', RECORD_KEY],
    ])(
      '--for %s exchanges the token of its variable at its endpoint',
      async (kind, path, otherPath, credential) => {
        setGitHubEnv();
        vi.stubEnv(
          kind === 'api' ? 'CURRENTS_OIDC_API_TOKEN' : 'CURRENTS_OIDC_TOKEN',
          JWT
        );
        vi.stubEnv(
          kind === 'api' ? 'CURRENTS_OIDC_TOKEN' : 'CURRENTS_OIDC_API_TOKEN',
          'other-jwt'
        );

        expect(await run(['exchange', '--for', kind])).toBe(0);

        expect(stdout).toBe(`${credential}\n`);
        expect(diagnostics()).toBe('');
        const [request] = requestsTo(path);
        expect(request.url).toBe(path);
        expect(request.headers['content-type']).toBe(
          'application/x-www-form-urlencoded'
        );
        expect(request.headers.authorization).toBeUndefined();
        expect(formBody(request)).toEqual({
          grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
          subject_token_type: 'urn:ietf:params:oauth:token-type:jwt',
          subject_token: JWT,
          project_id: 'p1',
        });
        expect(requestsTo(otherPath)).toEqual([]);
        expect(requestsTo('/github-token')).toEqual([]);
      }
    );

    it.each(['api', 'record'])(
      '--for %s --stdin reads the token from stdin',
      async (kind) => {
        setStdin(`${JWT}\n`);

        expect(await run(['exchange', '--for', kind, '--stdin'])).toBe(0);

        expect(stdout).toBe(`${kind === 'api' ? API_TOKEN : RECORD_KEY}\n`);
        expect(formBody(server.requests[0]).subject_token).toBe(JWT);
      }
    );

    it.each([
      ['piped input without --stdin', ['--for', 'api'], JWT],
      ['empty stdin', ['--for', 'api', '--stdin'], ' \n'],
      ['two values on stdin', ['--for', 'api', '--stdin'], 'one\ntwo'],
      ['no --for', [], JWT],
      ['an unknown --for', ['--for', 'other'], JWT],
    ])('fails without a request: %s', async (_name, args, input) => {
      setStdin(input);

      expectFailure(await run(['exchange', ...args]));

      expect(server.requests).toEqual([]);
    });

    it('fails when the variable and --stdin are both set', async () => {
      vi.stubEnv('CURRENTS_OIDC_API_TOKEN', JWT);
      setStdin(JWT);

      expectFailure(await run(['exchange', '--for', 'api', '--stdin']));

      expect(diagnostics()).toContain(
        'CURRENTS_OIDC_API_TOKEN and --stdin are both set'
      );
      expect(server.requests).toEqual([]);
    });

    it('names the variable when only the token of the other kind is set', async () => {
      vi.stubEnv('CURRENTS_OIDC_TOKEN', JWT);

      expectFailure(await run(['exchange', '--for', 'api']));

      expect(diagnostics()).toContain('CURRENTS_OIDC_API_TOKEN');
      expect(server.requests).toEqual([]);
    });

    it('requires the project, and --project-id wins over the variable', async () => {
      vi.stubEnv('CURRENTS_OIDC_API_TOKEN', JWT);
      vi.stubEnv('CURRENTS_PROJECT_ID', ' ');

      expectFailure(await run(['exchange', '--for', 'api']));
      expect(diagnostics()).toContain('Project ID is required');
      expect(server.requests).toEqual([]);

      vi.stubEnv('CURRENTS_PROJECT_ID', 'p1');
      stderr = '';
      await run(['exchange', '--for', 'api', '--project-id', 'flag-project']);
      expect(formBody(server.requests[0]).project_id).toBe('flag-project');
      expect(secretsIn(stderr)).toEqual([]);
    });

    it.each([
      [['--for', 'api', 'positional-secret']],
      [['--for', 'record', '--', 'positional-secret']],
    ])('refuses a token as an argument: %j', async (args) => {
      vi.stubEnv('CURRENTS_OIDC_API_TOKEN', JWT);
      vi.stubEnv('CURRENTS_OIDC_TOKEN', JWT);

      expectFailure(await run(['exchange', ...args]));

      expect(stderr).not.toContain('positional-secret');
      expect(server.requests).toEqual([]);
    });

    describe.each([[[]], [['--debug']]])('fails on %s', (extraArgs) => {
      it.each(exchangeFailures)('%s', async (_name, list) => {
        vi.stubEnv('CURRENTS_OIDC_API_TOKEN', JWT);
        responses['/oidc/api/token'] = withRedirectTarget(list);

        expectFailure(await run(['exchange', '--for', 'api', ...extraArgs]));

        expect(diagnostics()).toContain(
          'Could not exchange the token in CURRENTS_OIDC_API_TOKEN for a API token'
        );
        expect(redirectTarget.requests).toEqual([]);
      });
    });

    it('prints only the token after a retried 503, with the retry warning on stderr', async () => {
      vi.stubEnv('CURRENTS_OIDC_API_TOKEN', JWT);
      responses['/oidc/api/token'] = [{ status: 503 }];

      expect(await run(['exchange', '--for', 'api'])).toBe(0);

      expect(stdout).toBe(`${API_TOKEN}\n`);
      expect(requestsTo('/oidc/api/token')).toHaveLength(2);
      expect(diagnostics()).toMatch(/503|attempt/i);
    });

    it('exchanges on every call and never revokes', async () => {
      vi.stubEnv('CURRENTS_OIDC_API_TOKEN', JWT);
      responses['/oidc/api/token'] = [
        exchangeResponse('crnts_ciapi_one'),
        exchangeResponse('crnts_ciapi_two'),
      ];

      await run(['exchange', '--for', 'api']);
      await run(['exchange', '--for', 'api']);

      expect(stdout).toBe('crnts_ciapi_one\ncrnts_ciapi_two\n');
      expect(requestsTo('/oidc/api/revoke')).toEqual([]);
      expect(requestsTo('/oidc/revoke')).toEqual([]);
    });
  });

  describe('get-api-token', () => {
    it('gets the GitHub token for currents:api and prints only the API token', async () => {
      setGitHubEnv();

      expect(await run(['get-api-token'])).toBe(0);

      expect(stdout).toBe(`${API_TOKEN}\n`);
      expect(diagnostics()).toBe('');
      const [githubRequest] = requestsTo('/github-token');
      const url = new URL(githubRequest.url, server.url);
      expect(url.searchParams.get('api-version')).toBe('2.0');
      expect(url.searchParams.get('audience')).toBe('currents:api');
      expect(githubRequest.headers.authorization).toBe(
        `bearer ${REQUEST_SECRET}`
      );
      const [exchange] = requestsTo('/oidc/api/token');
      expect(exchange.url).toBe('/oidc/api/token');
      expect(exchange.headers.authorization).toBeUndefined();
      expect(formBody(exchange).subject_token).toBe(JWT);
      expect(JSON.stringify(exchange.headers)).not.toContain(REQUEST_SECRET);
    });

    it('asks for CURRENTS_OIDC_API_AUDIENCE, then --oidc-api-audience, never the record audience', async () => {
      setGitHubEnv();
      vi.stubEnv('CURRENTS_OIDC_AUDIENCE', 'wrong-record-audience');
      vi.stubEnv('CURRENTS_OIDC_API_AUDIENCE', 'env-audience');

      await run(['get-api-token']);
      await run(['get-api-token', '--oidc-api-audience', 'flag-audience']);

      expect(githubAudiences()).toEqual(['env-audience', 'flag-audience']);
      expect(formBody(requestsTo('/oidc/api/token')[0])).not.toHaveProperty(
        'audience'
      );
    });

    it('exchanges CURRENTS_OIDC_API_TOKEN even when CURRENTS_API_KEY is set', async () => {
      vi.stubEnv('CURRENTS_OIDC_API_TOKEN', JWT);
      vi.stubEnv('CURRENTS_API_KEY', 'configured-key');

      expect(await run(['get-api-token'])).toBe(0);

      expect(stdout).toBe(`${API_TOKEN}\n`);
      expect(formBody(requestsTo('/oidc/api/token')[0]).subject_token).toBe(
        JWT
      );
    });

    it('prints the token, its expiry and scopes with --json', async () => {
      vi.stubEnv('CURRENTS_OIDC_API_TOKEN', JWT);

      expect(await run(['get-api-token', '--json'])).toBe(0);

      expect(stdout.endsWith('}\n')).toBe(true);
      expect(JSON.parse(stdout)).toEqual({
        token: API_TOKEN,
        expires_at: EXPIRES_AT,
        scopes: ['runs:read', 'projects:read'],
      });
    });

    it.each([undefined, '', '  '])(
      'prints no scopes for the scope %j',
      async (scope) => {
        vi.stubEnv('CURRENTS_OIDC_API_TOKEN', JWT);
        responses['/oidc/api/token'] = [exchangeResponse(API_TOKEN, scope)];

        await run(['get-api-token', '--json']);

        expect(JSON.parse(stdout).scopes).toEqual([]);
      }
    );

    it.each([
      ['no token at all', () => {}],
      ['only the record token', () => vi.stubEnv('CURRENTS_OIDC_TOKEN', JWT)],
      [
        'a part of the GitHub variables',
        () => vi.stubEnv('ACTIONS_ID_TOKEN_REQUEST_TOKEN', REQUEST_SECRET),
      ],
    ])('says how to get a token when the job has %s', async (_name, setEnv) => {
      setEnv();

      expectFailure(await run(['get-api-token']));

      expect(diagnostics()).toContain('id-token: write');
      expect(diagnostics()).toContain('CURRENTS_OIDC_API_TOKEN');
      expect(diagnostics()).toContain('currents:api');
      expect(server.requests).toEqual([]);
    });

    it.each([
      ['GitHub answers 500, every time', Array(5).fill({ status: 500 })],
      ['GitHub sends no token', [{ status: 200, json: {} }]],
      [
        'GitHub redirects',
        [{ status: 307, headers: { location: 'REDIRECT' }, body: '' }],
      ],
    ])('does not exchange when %s', async (_name, list) => {
      setGitHubEnv();
      responses['/github-token'] = withRedirectTarget(list);

      expectFailure(await run(['get-api-token']));

      expect(diagnostics()).toContain('Could not get the GitHub Actions');
      expect(requestsTo('/oidc/api/token')).toEqual([]);
      expect(redirectTarget.requests).toEqual([]);
    });

    it.each(exchangeFailures)('fails on %s', async (_name, list) => {
      setGitHubEnv();
      responses['/oidc/api/token'] = withRedirectTarget(list);

      expectFailure(await run(['get-api-token', '--debug']));

      expect(redirectTarget.requests).toEqual([]);
    });

    it('refuses a token as an argument', async () => {
      vi.stubEnv('CURRENTS_OIDC_API_TOKEN', JWT);

      expectFailure(await run(['get-api-token', 'positional-secret']));

      expect(stderr).not.toContain('positional-secret');
      expect(server.requests).toEqual([]);
    });

    it('exchanges on every call and never revokes', async () => {
      setGitHubEnv();

      await run(['get-api-token']);
      await run(['get-api-token', '--json']);

      expect(requestsTo('/oidc/api/token')).toHaveLength(2);
      expect(requestsTo('/oidc/api/revoke')).toEqual([]);
      expect(requestsTo('/oidc/revoke')).toEqual([]);
    });
  });

  describe('get-record-key', () => {
    it('asks GitHub for currents:record-key, CURRENTS_OIDC_AUDIENCE, then --oidc-audience', async () => {
      setGitHubEnv();
      vi.stubEnv('CURRENTS_OIDC_API_AUDIENCE', 'wrong-api-audience');

      expect(await run(['get-record-key'])).toBe(0);
      vi.stubEnv('CURRENTS_OIDC_AUDIENCE', 'env-audience');
      await run(['get-record-key']);
      await run(['get-record-key', '--oidc-audience', 'flag-audience']);

      expect(stdout).toBe(`${RECORD_KEY}\n`.repeat(3));
      expect(githubAudiences()).toEqual([
        'currents:record-key',
        'env-audience',
        'flag-audience',
      ]);
      expect(requestsTo('/oidc/token')).toHaveLength(3);
      expect(requestsTo('/oidc/api/token')).toEqual([]);
    });

    it('exchanges CURRENTS_OIDC_TOKEN even when CURRENTS_RECORD_KEY is set', async () => {
      vi.stubEnv('CURRENTS_OIDC_TOKEN', JWT);
      vi.stubEnv('CURRENTS_OIDC_API_TOKEN', 'api-jwt');
      vi.stubEnv('CURRENTS_RECORD_KEY', 'configured-key');

      expect(await run(['get-record-key'])).toBe(0);

      expect(stdout).toBe(`${RECORD_KEY}\n`);
      expect(formBody(requestsTo('/oidc/token')[0]).subject_token).toBe(JWT);
    });

    it('names CURRENTS_OIDC_TOKEN when only the API token is set', async () => {
      vi.stubEnv('CURRENTS_OIDC_API_TOKEN', JWT);

      expectFailure(await run(['get-record-key']));

      expect(diagnostics()).toContain('CURRENTS_OIDC_TOKEN');
      expect(diagnostics()).toContain('currents:record-key');
      expect(server.requests).toEqual([]);
    });

    it('prints only the token and its expiry with --json, even with a scope', async () => {
      vi.stubEnv('CURRENTS_OIDC_TOKEN', JWT);
      responses['/oidc/token'] = [exchangeResponse(RECORD_KEY, 'unexpected')];

      expect(await run(['get-record-key', '--json'])).toBe(0);

      expect(JSON.parse(stdout)).toEqual({
        token: RECORD_KEY,
        expires_at: EXPIRES_AT,
      });
    });

    it('exchanges on every call and never revokes', async () => {
      setGitHubEnv();

      await run(['get-record-key']);
      await run(['get-record-key', '--json']);

      expect(requestsTo('/oidc/token')).toHaveLength(2);
      expect(requestsTo('/oidc/revoke')).toEqual([]);
      expect(requestsTo('/oidc/api/revoke')).toEqual([]);
    });
  });

  describe('revoke', () => {
    it.each([
      ['CURRENTS_API_KEY', API_TOKEN, '/oidc/api/revoke'],
      ['CURRENTS_RECORD_KEY', RECORD_KEY, '/oidc/revoke'],
    ])(
      'revokes the credential in %s at the endpoint of its prefix',
      async (env, credential, path) => {
        vi.stubEnv(env, credential);

        expect(await run(['revoke'])).toBe(0);

        expect(stdout).toBe('');
        expect(server.requests).toHaveLength(1);
        const [request] = requestsTo(path);
        expect(request.headers['content-type']).toBe(
          'application/x-www-form-urlencoded'
        );
        expect(formBody(request)).toEqual({
          token: credential,
          token_type_hint: 'access_token',
        });
        expect(secretsIn(diagnostics())).toEqual([]);
      }
    );

    it.each([
      [API_TOKEN, '/oidc/api/revoke'],
      [RECORD_KEY, '/oidc/revoke'],
    ])('revokes %s from stdin', async (credential, path) => {
      setStdin(`${credential}\n`);

      expect(await run(['revoke', '--stdin'])).toBe(0);

      expect(formBody(requestsTo(path)[0]).token).toBe(credential);
    });

    it.each([
      ['piped input without --stdin', [], API_TOKEN],
      ['empty stdin', ['--stdin'], '\n'],
      ['a credential as an argument', [API_TOKEN], ''],
      ['a credential after --', ['--', RECORD_KEY], ''],
    ])('fails without a request: %s', async (_name, args, input) => {
      setStdin(input);

      expectFailure(await run(['revoke', ...args]));

      expect(server.requests).toEqual([]);
    });

    it.each([
      'configured-key',
      'eyJhbGciOiJSUzI1NiJ9.e30.sig',
      'crnts_ciapi',
      'crnts_ci',
      'crnts_other_x',
    ])('refuses %s from stdin', async (credential) => {
      setStdin(credential);

      expectFailure(await run(['revoke', '--stdin']));

      expect(diagnostics()).toContain('crnts_ciapi_');
      if (!'crnts_ciapi_'.startsWith(credential)) {
        expect(diagnostics()).not.toContain(credential);
      }
      expect(server.requests).toEqual([]);
    });

    it('does not revoke a key from the dashboard in the environment', async () => {
      vi.stubEnv('CURRENTS_API_KEY', 'configured-key');
      vi.stubEnv('CURRENTS_RECORD_KEY', 'crnts_other_x');

      expectFailure(await run(['revoke']));

      expect(diagnostics()).toContain('No OIDC credential to revoke');
      expect(diagnostics()).not.toContain('crnts_other_x');
      expect(server.requests).toEqual([]);
    });

    it('fails when a credential variable and --stdin are both set', async () => {
      vi.stubEnv('CURRENTS_API_KEY', API_TOKEN);
      setStdin(RECORD_KEY);

      expectFailure(await run(['revoke', '--stdin']));

      expect(server.requests).toEqual([]);
    });

    describe.each([[[]], [['--debug']]])('fails on %s', (extraArgs) => {
      it.each([
        [
          'a 400 that repeats the credential',
          {
            status: 400,
            json: { error_description: `bad ${API_TOKEN}` },
          } as Response,
        ],
        ['a 500', { status: 500 } as Response],
        ['a closed connection', { destroy: true } as Response],
        [
          'a redirect',
          { status: 307, headers: { location: 'REDIRECT' }, body: '' },
        ],
      ])('%s, after one attempt', async (_name, response) => {
        vi.stubEnv('CURRENTS_API_KEY', API_TOKEN);
        responses['/oidc/api/revoke'] = withRedirectTarget([response]);

        expectFailure(await run(['revoke', ...extraArgs]));

        expect(diagnostics()).toContain('Could not revoke the API token');
        expect(requestsTo('/oidc/api/revoke')).toHaveLength(1);
        expect(redirectTarget.requests).toEqual([]);
      });
    });
  });

  describe('GitHub masks', () => {
    it('masks the GitHub token before the exchange, and the API token before stdout', async () => {
      setGitHubEnv();

      await run(['get-api-token', '--json']);

      const maskJwt = trace.indexOf(`stderr ::add-mask::${JWT}\n`);
      const maskToken = trace.indexOf(`stderr ::add-mask::${API_TOKEN}\n`);
      const exchange = trace.indexOf('request /oidc/api/token');
      const output = trace.findIndex((line) => line.startsWith('stdout '));
      expect(maskJwt).toBeGreaterThan(-1);
      expect(maskJwt).toBeLessThan(exchange);
      expect(maskToken).toBeGreaterThan(exchange);
      expect(maskToken).toBeLessThan(output);
    });

    it.each([
      ['exchange --for record', ['exchange', '--for', 'record'], RECORD_KEY],
      ['get-record-key', ['get-record-key'], RECORD_KEY],
    ])(
      '%s masks the token of the variable and the key',
      async (_n, args, key) => {
        vi.stubEnv('GITHUB_ACTIONS', 'true');
        vi.stubEnv('CURRENTS_OIDC_TOKEN', JWT);

        await run(args);

        expect(stderr).toBe(`::add-mask::${JWT}\n::add-mask::${key}\n`);
      }
    );

    it('masks the token from stdin and the credential to revoke', async () => {
      vi.stubEnv('GITHUB_ACTIONS', 'true');
      setStdin(JWT);
      await run(['exchange', '--for', 'api', '--stdin']);
      expect(stderr).toContain(`::add-mask::${JWT}\n`);

      stderr = '';
      trace = [];
      vi.stubEnv('CURRENTS_API_KEY', API_TOKEN);
      await run(['revoke']);
      expect(trace.indexOf(`stderr ::add-mask::${API_TOKEN}\n`)).toBeLessThan(
        trace.indexOf('request /oidc/api/revoke')
      );
    });

    it('escapes the values, so a newline does not start another command', async () => {
      vi.stubEnv('GITHUB_ACTIONS', 'true');
      vi.stubEnv('CURRENTS_OIDC_API_TOKEN', 'jwt%a\r\n::warning::b');
      responses['/oidc/api/token'] = [exchangeResponse('crnts_ciapi_%\nx')];

      await run(['exchange', '--for', 'api']);

      expect(stderr).toBe(
        '::add-mask::jwt%25a%0D%0A::warning::b\n::add-mask::crnts_ciapi_%25%0Ax\n'
      );
    });

    it('writes no workflow command outside GitHub Actions', async () => {
      vi.stubEnv('CURRENTS_OIDC_API_TOKEN', JWT);
      vi.stubEnv('CURRENTS_API_KEY', API_TOKEN);

      await run(['exchange', '--for', 'api']);
      await run(['revoke']);
      maskInGitHubLog('secret', {});

      expect(stderr).not.toContain('::');
    });
  });

  it('keeps the secrets out of the debug log', async () => {
    setGitHubEnv();
    vi.stubEnv('CURRENTS_API_KEY', API_TOKEN);
    await run(['get-api-token', '--debug']);
    await run(['revoke', '--debug']);
    const output = stdout;

    expect(output).toBe(`${API_TOKEN}\n`);
    expect(stderr).toContain('network request');
    expect(secretsIn(diagnostics())).toEqual([]);
  });
});
