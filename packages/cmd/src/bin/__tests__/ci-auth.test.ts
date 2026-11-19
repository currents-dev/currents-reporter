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
import { maskInGitHubLog } from '../../lib/oidc';
import {
  ApiServer,
  RecordedRequest,
  Response,
  startApiServer,
} from '../../test-utils/api-server';
import { Command } from '@commander-js/extra-typings';
import { messageWithoutValues } from '../../commands/utils';
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

const GITHUB = ['--oidc-provider', 'github-actions'];

/** A token with the audience; the signature has the characters that URL encoding changes. */
const jwtFor = (aud: unknown) =>
  [
    Buffer.from('{"alg":"RS256"}').toString('base64url'),
    Buffer.from(JSON.stringify({ aud })).toString('base64url'),
    'sig/+1=',
  ].join('.');
const API_JWT = jwtFor('currents:api');
const RECORD_JWT = jwtFor('currents:record-key');

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
  /** stderr without the GitHub mask commands, which hold the secrets on purpose. */
  const diagnostics = () => stderr.replace(MASK_LINE, '');
  const secretsIn = (text: string) =>
    [
      JWT,
      API_JWT,
      RECORD_JWT,
      API_TOKEN,
      RECORD_KEY,
      REQUEST_SECRET,
      'configured-key',
    ]
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
      'GITLAB_CI',
      'CI_SERVER_NAME',
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
    ...[123, { value: API_TOKEN }, ''].map(
      (accessToken): [string, Response[]] => [
        `the token ${JSON.stringify(accessToken)}`,
        [{ status: 200, json: { access_token: accessToken, expires_in: 600 } }],
      ]
    ),
    [
      'the expiry "600"',
      [{ status: 200, json: { access_token: API_TOKEN, expires_in: '600' } }],
    ],
    [
      'a response without an expiry',
      [{ status: 200, json: { access_token: API_TOKEN } }],
    ],
    ['a closed connection, every time', Array(5).fill({ destroy: true })],
    ['503, every time', Array(5).fill({ status: 503 })],
    ...[307, 308].map((status): [string, Response[]] => [
      `a ${status} redirect`,
      [{ status, headers: { location: 'REDIRECT' }, body: '' }],
    ]),
  ];
  const providerFailures: [string, Response[]][] = [
    ['GitHub answers 500, every time', Array(5).fill({ status: 500 })],
    ['GitHub sends no token', [{ status: 200, json: {} }]],
    [
      'GitHub answers 400 and repeats the request token',
      [
        {
          status: 400,
          json: {
            message: `bad ${REQUEST_SECRET} ${JWT} ${encodeURIComponent(JWT)}`,
          },
        },
      ],
    ],
    ...[307, 308].map((status): [string, Response[]] => [
      `GitHub redirects with ${status}`,
      [{ status, headers: { location: 'REDIRECT' }, body: '' }],
    ]),
  ];
  const withRedirectTarget = (list: Response[]) =>
    list.map((r) =>
      'headers' in r && r.headers?.location === 'REDIRECT'
        ? { ...r, headers: { location: `${redirectTarget.url}/oidc` } }
        : r
    );

  describe('exchange', () => {
    it.each([
      ['api', API_JWT, '/oidc/api/token', '/oidc/token', API_TOKEN],
      ['record', RECORD_JWT, '/oidc/token', '/oidc/api/token', RECORD_KEY],
    ])(
      'exchanges CURRENTS_OIDC_TOKEN with the %s audience at its endpoint',
      async (_kind, token, path, otherPath, credential) => {
        setGitHubEnv();
        vi.stubEnv('CURRENTS_OIDC_TOKEN', token);

        expect(await run(['exchange'])).toBe(0);

        expect(stdout).toBe(`${credential}\n`);
        const [request] = requestsTo(path);
        expect(request.url).toBe(path);
        expect(request.headers['content-type']).toBe(
          'application/x-www-form-urlencoded'
        );
        expect(request.headers.authorization).toBeUndefined();
        expect(formBody(request)).toEqual({
          grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
          subject_token_type: 'urn:ietf:params:oauth:token-type:jwt',
          subject_token: token,
          project_id: 'p1',
        });
        expect(requestsTo(otherPath)).toEqual([]);
        expect(requestsTo('/github-token')).toEqual([]);
      }
    );

    it.each([
      ['currents:api:staging', '/oidc/api/token'],
      ['currents:record-key:on-prem', '/oidc/token'],
      [['other', 'currents:api'], '/oidc/api/token'],
      [['currents:record-key', 'other'], '/oidc/token'],
    ])('picks the endpoint of the audience %j', async (aud, path) => {
      vi.stubEnv('CURRENTS_OIDC_TOKEN', jwtFor(aud));

      expect(await run(['exchange'])).toBe(0);

      expect(server.requests.map((r) => r.url)).toEqual([path]);
    });

    it.each([
      ['another audience', jwtFor('sts.amazonaws.com')],
      ['a prefix without a colon', jwtFor('currents:apiary')],
      [
        'both Currents audiences',
        jwtFor(['currents:api', 'currents:record-key']),
      ],
      ['no audience', jwtFor(undefined)],
      ['a value that is not a JWT', JWT],
    ])(
      'asks for --for for a token with %s, and sends nothing',
      async (_name, token) => {
        vi.stubEnv('CURRENTS_OIDC_TOKEN', token);

        expectFailure(await run(['exchange']));

        expect(diagnostics()).toContain('pass --for api or --for record');
        expect(diagnostics()).not.toContain('sts.amazonaws.com');
        expect(server.requests).toEqual([]);
      }
    );

    it('takes --for over the audience, and never tries the other kind', async () => {
      vi.stubEnv('CURRENTS_OIDC_TOKEN', API_JWT);
      responses['/oidc/token'] = [
        { status: 400, json: { error: 'invalid_grant' } },
      ];

      expectFailure(await run(['exchange', '--for', 'record']));

      expect(server.requests.map((r) => r.url)).toEqual(['/oidc/token']);
    });

    it('exchanges a token with another audience with --for', async () => {
      vi.stubEnv('CURRENTS_OIDC_TOKEN', JWT);

      expect(await run(['exchange', '--for', 'api'])).toBe(0);

      expect(formBody(requestsTo('/oidc/api/token')[0]).subject_token).toBe(
        JWT
      );
    });

    it.each([
      ['api', API_JWT, API_TOKEN],
      ['record', RECORD_JWT, RECORD_KEY],
    ])(
      '--stdin reads the token with the %s audience from stdin',
      async (_kind, token, credential) => {
        setStdin(`${token}\n`);

        expect(await run(['exchange', '--stdin'])).toBe(0);

        expect(stdout).toBe(`${credential}\n`);
        expect(formBody(server.requests[0]).subject_token).toBe(token);
      }
    );

    it('takes the token from --stdin over CURRENTS_OIDC_TOKEN', async () => {
      vi.stubEnv('CURRENTS_OIDC_TOKEN', API_JWT);
      setStdin(RECORD_JWT);

      expect(await run(['exchange', '--stdin'])).toBe(0);

      expect(stdout).toBe(`${RECORD_KEY}\n`);
      expect(server.requests.map((r) => r.url)).toEqual(['/oidc/token']);
      expect(formBody(server.requests[0]).subject_token).toBe(RECORD_JWT);
    });

    it('does not read CURRENTS_OIDC_API_TOKEN', async () => {
      vi.stubEnv('CURRENTS_OIDC_API_TOKEN', API_JWT);

      expectFailure(await run(['exchange']));

      expect(diagnostics()).toContain(
        'No OIDC token: set CURRENTS_OIDC_TOKEN or pass --stdin'
      );
      expect(server.requests).toEqual([]);
    });

    it.each([
      ['piped input without --stdin', [], API_JWT],
      ['empty stdin', ['--stdin'], ' \n'],
      ['two values on stdin', ['--stdin'], 'one\ntwo'],
      ['an unknown --for', ['--for', 'other', '--stdin'], API_JWT],
    ])('fails without a request: %s', async (_name, args, input) => {
      setStdin(input);

      expectFailure(await run(['exchange', ...args]));

      expect(server.requests).toEqual([]);
    });

    it('requires the project, and --project-id wins over the variable', async () => {
      vi.stubEnv('CURRENTS_OIDC_TOKEN', API_JWT);
      vi.stubEnv('CURRENTS_PROJECT_ID', ' ');

      expectFailure(await run(['exchange']));
      expect(diagnostics()).toContain('Project ID is required');
      expect(server.requests).toEqual([]);

      vi.stubEnv('CURRENTS_PROJECT_ID', 'p1');
      stderr = '';
      await run(['exchange', '--project-id', 'flag-project']);
      expect(formBody(server.requests[0]).project_id).toBe('flag-project');
      expect(secretsIn(stderr)).toEqual([]);
    });

    it.each([
      [['--for', 'api', 'positional-secret']],
      [['--for', 'record', '--', 'positional-secret']],
    ])('refuses a token as an argument: %j', async (args) => {
      vi.stubEnv('CURRENTS_OIDC_TOKEN', API_JWT);

      expectFailure(await run(['exchange', ...args]));

      expect(stderr).not.toContain('positional-secret');
      expect(server.requests).toEqual([]);
    });

    describe.each([[[]], [['--debug']]])('fails on %s', (extraArgs) => {
      it.each(exchangeFailures)('%s', async (_name, list) => {
        vi.stubEnv('CURRENTS_OIDC_TOKEN', JWT);
        responses['/oidc/api/token'] = withRedirectTarget(list);

        expectFailure(await run(['exchange', '--for', 'api', ...extraArgs]));

        expect(diagnostics()).toContain(
          'Could not exchange the token in CURRENTS_OIDC_TOKEN for an API token'
        );
        expect(redirectTarget.requests).toEqual([]);
      });
    });

    it('prints only the token after a retried 503, with the retry warning on stderr', async () => {
      vi.stubEnv('CURRENTS_OIDC_TOKEN', API_JWT);
      responses['/oidc/api/token'] = [{ status: 503 }];

      expect(await run(['exchange'])).toBe(0);

      expect(stdout).toBe(`${API_TOKEN}\n`);
      expect(requestsTo('/oidc/api/token')).toHaveLength(2);
      expect(diagnostics()).toMatch(/503|attempt/i);
    });

    it('exchanges on every call and never revokes', async () => {
      vi.stubEnv('CURRENTS_OIDC_TOKEN', API_JWT);
      responses['/oidc/api/token'] = [
        exchangeResponse('crnts_ciapi_one'),
        exchangeResponse('crnts_ciapi_two'),
      ];

      await run(['exchange']);
      await run(['exchange']);

      expect(stdout).toBe('crnts_ciapi_one\ncrnts_ciapi_two\n');
      expect(requestsTo('/oidc/api/revoke')).toEqual([]);
      expect(requestsTo('/oidc/revoke')).toEqual([]);
    });
  });

  describe('get-api-token', () => {
    it('gets the GitHub token for currents:api and prints only the API token', async () => {
      setGitHubEnv();

      expect(await run(['get-api-token', ...GITHUB])).toBe(0);

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

    it('asks for CURRENTS_OIDC_API_AUDIENCE, then --audience, never the record audience', async () => {
      setGitHubEnv();
      vi.stubEnv('CURRENTS_OIDC_AUDIENCE', 'wrong-record-audience');
      vi.stubEnv('CURRENTS_OIDC_API_AUDIENCE', 'env-audience');

      await run(['get-api-token', ...GITHUB]);
      await run(['get-api-token', ...GITHUB, '--audience', 'flag-audience']);

      expect(githubAudiences()).toEqual(['env-audience', 'flag-audience']);
      expect(formBody(requestsTo('/oidc/api/token')[0])).not.toHaveProperty(
        'audience'
      );
    });

    it('exchanges the token of the provider, not CURRENTS_OIDC_TOKEN, even when CURRENTS_API_KEY is set', async () => {
      setGitHubEnv();
      vi.stubEnv('CURRENTS_OIDC_TOKEN', RECORD_JWT);
      vi.stubEnv('CURRENTS_OIDC_API_TOKEN', API_JWT);
      vi.stubEnv('CURRENTS_API_KEY', 'configured-key');

      expect(await run(['get-api-token', ...GITHUB])).toBe(0);

      expect(stdout).toBe(`${API_TOKEN}\n`);
      expect(formBody(requestsTo('/oidc/api/token')[0]).subject_token).toBe(
        JWT
      );
    });

    it('prints the token, its expiry and scopes with --json', async () => {
      setGitHubEnv();

      expect(await run(['get-api-token', ...GITHUB, '--json'])).toBe(0);

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
        setGitHubEnv();
        responses['/oidc/api/token'] = [exchangeResponse(API_TOKEN, scope)];

        await run(['get-api-token', ...GITHUB, '--json']);

        expect(JSON.parse(stdout).scopes).toEqual([]);
      }
    );

    it.each([
      ['no token at all', () => {}],
      [
        'only a token in CURRENTS_OIDC_TOKEN',
        () => vi.stubEnv('CURRENTS_OIDC_TOKEN', API_JWT),
      ],
      [
        'a part of the GitHub variables',
        () => vi.stubEnv('ACTIONS_ID_TOKEN_REQUEST_TOKEN', REQUEST_SECRET),
      ],
    ])('says how to get a token when the job has %s', async (_name, setEnv) => {
      setEnv();

      expectFailure(await run(['get-api-token', ...GITHUB]));

      expect(diagnostics()).toContain('id-token: write');
      expect(server.requests).toEqual([]);
    });

    it.each(providerFailures)(
      'does not exchange when %s',
      async (_name, list) => {
        setGitHubEnv();
        responses['/github-token'] = withRedirectTarget(list);

        expectFailure(await run(['get-api-token', ...GITHUB, '--debug']));

        expect(diagnostics()).toContain('Could not get the GitHub Actions');
        expect(requestsTo('/oidc/api/token')).toEqual([]);
        expect(redirectTarget.requests).toEqual([]);
      }
    );

    it.each(exchangeFailures)('fails on %s', async (_name, list) => {
      setGitHubEnv();
      responses['/oidc/api/token'] = withRedirectTarget(list);

      expectFailure(await run(['get-api-token', ...GITHUB, '--debug']));

      expect(redirectTarget.requests).toEqual([]);
    });

    it('refuses a token as an argument', async () => {
      setGitHubEnv();

      expectFailure(
        await run(['get-api-token', ...GITHUB, 'positional-secret'])
      );

      expect(stderr).not.toContain('positional-secret');
      expect(server.requests).toEqual([]);
    });

    it('exchanges on every call and never revokes', async () => {
      setGitHubEnv();

      await run(['get-api-token', ...GITHUB]);
      await run(['get-api-token', ...GITHUB, '--json']);

      expect(requestsTo('/oidc/api/token')).toHaveLength(2);
      expect(requestsTo('/oidc/api/revoke')).toEqual([]);
      expect(requestsTo('/oidc/revoke')).toEqual([]);
    });
  });

  describe('get-record-key', () => {
    it('asks GitHub for currents:record-key, CURRENTS_OIDC_AUDIENCE, then --audience', async () => {
      setGitHubEnv();
      vi.stubEnv('CURRENTS_OIDC_API_AUDIENCE', 'wrong-api-audience');

      expect(await run(['get-record-key', ...GITHUB])).toBe(0);
      vi.stubEnv('CURRENTS_OIDC_AUDIENCE', 'env-audience');
      await run(['get-record-key', ...GITHUB]);
      await run(['get-record-key', ...GITHUB, '--audience', 'flag-audience']);

      expect(stdout).toBe(`${RECORD_KEY}\n`.repeat(3));
      expect(githubAudiences()).toEqual([
        'currents:record-key',
        'env-audience',
        'flag-audience',
      ]);
      expect(requestsTo('/oidc/token')).toHaveLength(3);
      expect(requestsTo('/oidc/api/token')).toEqual([]);
    });

    it('exchanges the token of the provider, not CURRENTS_OIDC_TOKEN, even when CURRENTS_RECORD_KEY is set', async () => {
      setGitHubEnv();
      vi.stubEnv('CURRENTS_OIDC_TOKEN', RECORD_JWT);
      vi.stubEnv('CURRENTS_RECORD_KEY', 'configured-key');

      expect(await run(['get-record-key', ...GITHUB])).toBe(0);

      expect(stdout).toBe(`${RECORD_KEY}\n`);
      expect(formBody(requestsTo('/oidc/token')[0]).subject_token).toBe(JWT);
    });

    it('prints only the token and its expiry with --json, even with a scope', async () => {
      setGitHubEnv();
      responses['/oidc/token'] = [exchangeResponse(RECORD_KEY, 'unexpected')];

      expect(await run(['get-record-key', ...GITHUB, '--json'])).toBe(0);

      expect(JSON.parse(stdout)).toEqual({
        token: RECORD_KEY,
        expires_at: EXPIRES_AT,
      });
    });

    it('requires the project before it requests a token', async () => {
      setGitHubEnv();
      vi.stubEnv('CURRENTS_PROJECT_ID', ' ');

      expectFailure(await run(['get-record-key', ...GITHUB]));

      expect(diagnostics()).toContain('Project ID is required');
      expect(server.requests).toEqual([]);
    });

    it.each([
      ['get-record-key', 'the GitHub Actions OIDC token is not available'],
      ['get-api-token', 'the GitHub Actions OIDC token is not available'],
    ])(
      '%s says how to get a token when the job has none',
      async (command, message) => {
        expectFailure(await run([command, ...GITHUB]));

        expect(diagnostics()).toContain(message);
        expect(diagnostics()).toContain('id-token: write');
        expect(server.requests).toEqual([]);
      }
    );

    it('refuses a token as an argument', async () => {
      setGitHubEnv();

      expectFailure(
        await run(['get-record-key', ...GITHUB, 'positional-secret'])
      );

      expect(stderr).not.toContain('positional-secret');
      expect(server.requests).toEqual([]);
    });

    it.each(providerFailures)(
      'does not exchange when %s',
      async (_name, list) => {
        setGitHubEnv();
        responses['/github-token'] = withRedirectTarget(list);

        expectFailure(await run(['get-record-key', ...GITHUB, '--debug']));

        expect(requestsTo('/oidc/token')).toEqual([]);
        expect(redirectTarget.requests).toEqual([]);
      }
    );

    it.each(exchangeFailures)('fails on %s', async (_name, list) => {
      setGitHubEnv();
      responses['/oidc/token'] = withRedirectTarget(list);

      expectFailure(await run(['get-record-key', ...GITHUB, '--debug']));

      expect(diagnostics()).toContain(
        'Could not exchange the GitHub Actions OIDC token for a record key'
      );
      expect(redirectTarget.requests).toEqual([]);
    });

    it('exchanges on every call and never revokes', async () => {
      setGitHubEnv();

      await run(['get-record-key', ...GITHUB]);
      await run(['get-record-key', ...GITHUB, '--json']);

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
      expect(diagnostics()).toContain('crnts_ciapi_');
      expect(diagnostics()).toContain('crnts_ci_');
      expect(diagnostics()).not.toContain('crnts_other_x');
      expect(server.requests).toEqual([]);
    });

    it('skips a key from the dashboard and revokes the OIDC credential next to it', async () => {
      vi.stubEnv('CURRENTS_API_KEY', 'configured-key');
      vi.stubEnv('CURRENTS_RECORD_KEY', RECORD_KEY);

      expect(await run(['revoke'])).toBe(0);

      expect(diagnostics()).toContain(
        'CURRENTS_API_KEY is not from an OIDC exchange'
      );
      expect(server.requests.map((r) => r.url)).toEqual(['/oidc/revoke']);
    });

    it('revokes both OIDC credentials when both variables hold one', async () => {
      vi.stubEnv('CURRENTS_API_KEY', API_TOKEN);
      vi.stubEnv('CURRENTS_RECORD_KEY', RECORD_KEY);

      expect(await run(['revoke'])).toBe(0);

      expect(server.requests.map((r) => [r.url, formBody(r).token])).toEqual([
        ['/oidc/api/revoke', API_TOKEN],
        ['/oidc/revoke', RECORD_KEY],
      ]);
    });

    it('picks the endpoint by the prefix, not by the variable', async () => {
      vi.stubEnv('CURRENTS_RECORD_KEY', API_TOKEN);

      expect(await run(['revoke'])).toBe(0);

      expect(server.requests.map((r) => r.url)).toEqual(['/oidc/api/revoke']);
    });

    it('gives up after 5 seconds without an answer', async () => {
      vi.stubEnv('CURRENTS_API_KEY', API_TOKEN);
      responses['/oidc/api/revoke'] = [{ hang: true }];

      expectFailure(await run(['revoke']));

      expect(diagnostics()).toContain('deadline of 5000ms exceeded');
      expect(requestsTo('/oidc/api/revoke')).toHaveLength(1);
    }, 10_000);

    it('takes the credential from --stdin over the variables', async () => {
      vi.stubEnv('CURRENTS_API_KEY', API_TOKEN);
      setStdin(RECORD_KEY);

      expect(await run(['revoke', '--stdin'])).toBe(0);

      expect(server.requests.map((r) => [r.url, formBody(r).token])).toEqual([
        ['/oidc/revoke', RECORD_KEY],
      ]);
    });

    it('tries every credential, then fails when one was not revoked', async () => {
      vi.stubEnv('CURRENTS_API_KEY', API_TOKEN);
      vi.stubEnv('CURRENTS_RECORD_KEY', RECORD_KEY);
      responses['/oidc/api/revoke'] = [
        { status: 400, json: { error_description: `bad ${API_TOKEN}` } },
      ];

      expectFailure(await run(['revoke']));

      expect(server.requests.map((r) => r.url)).toEqual([
        '/oidc/api/revoke',
        '/oidc/revoke',
      ]);
      expect(diagnostics()).toContain('Could not revoke the API token');
      expect(diagnostics()).toContain('Revoked the record key');
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
        ...[307, 308].map((status): [string, Response] => [
          `a ${status} redirect`,
          { status, headers: { location: 'REDIRECT' }, body: '' },
        ]),
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

      await run(['get-api-token', ...GITHUB, '--json']);

      const maskJwt = trace.indexOf(`stderr ::add-mask::${JWT}\n`);
      const maskToken = trace.indexOf(`stderr ::add-mask::${API_TOKEN}\n`);
      const exchange = trace.indexOf('request /oidc/api/token');
      const output = trace.findIndex((line) => line.startsWith('stdout '));
      expect(maskJwt).toBeGreaterThan(-1);
      expect(maskJwt).toBeLessThan(exchange);
      expect(maskToken).toBeGreaterThan(exchange);
      expect(maskToken).toBeLessThan(output);
    });

    it('exchange masks the token of the variable and the key', async () => {
      vi.stubEnv('GITHUB_ACTIONS', 'true');
      vi.stubEnv('CURRENTS_OIDC_TOKEN', RECORD_JWT);

      await run(['exchange']);

      expect(stderr).toBe(
        `::add-mask::${RECORD_JWT}\n::add-mask::${RECORD_KEY}\n`
      );
    });

    it('get-record-key masks the token of the provider once, then the key', async () => {
      setGitHubEnv();

      await run(['get-record-key', ...GITHUB]);

      expect(stderr).toBe(`::add-mask::${JWT}\n::add-mask::${RECORD_KEY}\n`);
    });

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
      vi.stubEnv('CURRENTS_OIDC_TOKEN', 'jwt%a\r\n::warning::b');
      responses['/oidc/api/token'] = [exchangeResponse('crnts_ciapi_%\nx')];

      await run(['exchange', '--for', 'api']);

      expect(stderr).toBe(
        '::add-mask::jwt%25a%0D%0A::warning::b\n::add-mask::crnts_ciapi_%25%0Ax\n'
      );
    });

    it('writes no workflow command outside GitHub Actions', async () => {
      vi.stubEnv('CURRENTS_OIDC_TOKEN', JWT);
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
    await run(['get-api-token', ...GITHUB, '--debug']);
    await run(['revoke', '--debug']);
    const output = stdout;

    expect(output).toBe(`${API_TOKEN}\n`);
    expect(stderr).toContain('network request');
    expect(secretsIn(diagnostics())).toEqual([]);
  });

  describe('get-oidc-token', () => {
    it.each([
      ['api', 'currents:api'],
      ['record', 'currents:record-key'],
    ])(
      '--for %s prints only the GitHub token for %s',
      async (kind, audience) => {
        setGitHubEnv();

        expect(await run(['get-oidc-token', ...GITHUB, '--for', kind])).toBe(0);

        expect(stdout).toBe(`${JWT}\n`);
        const [githubRequest] = requestsTo('/github-token');
        const url = new URL(githubRequest.url, server.url);
        expect(url.searchParams.get('audience')).toBe(audience);
        expect(url.searchParams.get('api-version')).toBe('2.0');
        expect(githubRequest.headers.authorization).toBe(
          `bearer ${REQUEST_SECRET}`
        );
        expect(server.requests).toHaveLength(1);
        expect(diagnostics()).toBe('');
        expect(trace.indexOf(`stderr ::add-mask::${JWT}\n`)).toBeLessThan(
          trace.indexOf(`stdout ${JWT}\n`)
        );
      }
    );

    it('asks for the API audience: default, CURRENTS_OIDC_API_AUDIENCE, then the flag', async () => {
      setGitHubEnv();
      vi.stubEnv('CURRENTS_OIDC_AUDIENCE', 'wrong-record-audience');

      await run(['get-oidc-token', ...GITHUB, '--for', 'api']);
      vi.stubEnv('CURRENTS_OIDC_API_AUDIENCE', 'env-api');
      await run(['get-oidc-token', ...GITHUB, '--for', 'api']);
      await run([
        'get-oidc-token',
        ...GITHUB,
        '--for',
        'api',
        '--audience',
        'flag api/&=?',
      ]);

      expect(githubAudiences()).toEqual([
        'currents:api',
        'env-api',
        'flag api/&=?',
      ]);
    });

    it('asks for the record audience: default, CURRENTS_OIDC_AUDIENCE, then the flag', async () => {
      setGitHubEnv();
      vi.stubEnv('CURRENTS_OIDC_API_AUDIENCE', 'wrong-api-audience');

      await run(['get-oidc-token', ...GITHUB, '--for', 'record']);
      vi.stubEnv('CURRENTS_OIDC_AUDIENCE', 'env-record');
      await run(['get-oidc-token', ...GITHUB, '--for', 'record']);
      await run([
        'get-oidc-token',
        ...GITHUB,
        '--for',
        'record',
        '--audience',
        'flag-record',
      ]);

      expect(githubAudiences()).toEqual([
        'currents:record-key',
        'env-record',
        'flag-record',
      ]);
    });

    it.each(['api', 'record'])(
      '--for %s gets the token from the provider, never from the variables',
      async (kind) => {
        setGitHubEnv();
        vi.stubEnv('CURRENTS_OIDC_API_TOKEN', 'api-jwt');
        vi.stubEnv('CURRENTS_OIDC_TOKEN', 'record-jwt');

        expect(await run(['get-oidc-token', ...GITHUB, '--for', kind])).toBe(0);

        expect(stdout).toBe(`${JWT}\n`);
        expect(stdout + stderr).not.toContain('-jwt');
      }
    );

    it.each([
      [
        'without the request token',
        () =>
          vi.stubEnv(
            'ACTIONS_ID_TOKEN_REQUEST_URL',
            `${server.url}/github-token`
          ),
      ],
      [
        'without the request URL',
        () => vi.stubEnv('ACTIONS_ID_TOKEN_REQUEST_TOKEN', REQUEST_SECRET),
      ],
    ])('says how to get a GitHub token %s', async (_name, setEnv) => {
      vi.stubEnv('GITHUB_ACTIONS', 'true');
      vi.stubEnv('CURRENTS_OIDC_TOKEN', JWT);
      setEnv();

      expectFailure(await run(['get-oidc-token', ...GITHUB, '--for', 'api']));

      expect(diagnostics()).toContain('id-token: write');
      expect(server.requests).toEqual([]);
    });

    it.each(providerFailures)('fails when %s', async (_name, list) => {
      setGitHubEnv();
      responses['/github-token'] = withRedirectTarget(list);

      expectFailure(
        await run(['get-oidc-token', ...GITHUB, '--for', 'api', '--debug'])
      );

      expect(diagnostics()).toContain('Could not get the GitHub Actions');
      expect(redirectTarget.requests).toEqual([]);
    });

    it('prints only the token after a retried 503', async () => {
      setGitHubEnv();
      responses['/github-token'] = [{ status: 503 }];

      expect(await run(['get-oidc-token', ...GITHUB, '--for', 'api'])).toBe(0);

      expect(stdout).toBe(`${JWT}\n`);
      expect(requestsTo('/github-token')).toHaveLength(2);
    });

    it.each([
      [[]],
      [['--for', 'other']],
      [['--for', 'api', 'positional-secret']],
      [['--for', 'api', '--', 'positional-secret']],
      [['--for', 'api', '--stdin']],
    ])(
      'fails before getting a token, without reading stdin: %j',
      async (args) => {
        setGitHubEnv();
        const stdin = setStdin(JWT);

        expectFailure(await run(['get-oidc-token', ...GITHUB, ...args]));

        expect(stderr).not.toContain('positional-secret');
        expect(server.requests).toEqual([]);
        expect(stdin).not.toHaveBeenCalled();
      }
    );

    it('needs no project, gets the token again on every call, and revokes nothing', async () => {
      setGitHubEnv();
      vi.stubEnv('CURRENTS_PROJECT_ID', undefined);

      await run(['get-oidc-token', ...GITHUB, '--for', 'api']);
      await run(['get-oidc-token', ...GITHUB, '--for', 'record']);

      expect(stdout).toBe(`${JWT}\n${JWT}\n`);
      expect(server.requests.map((r) => r.url.split('?')[0])).toEqual([
        '/github-token',
        '/github-token',
      ]);
    });

    it('escapes the mask of the token', async () => {
      setGitHubEnv();
      responses['/github-token'] = [
        { status: 200, json: { value: 'jwt%a\r\n::warning::b' } },
      ];

      await run(['get-oidc-token', ...GITHUB, '--for', 'api']);

      expect(stderr).toBe('::add-mask::jwt%25a%0D%0A::warning::b\n');
    });
  });

  describe('status', () => {
    const SENTINELS = [
      'sentinel-api-key',
      'sentinel-record-key',
      'sentinel-api-jwt',
      'sentinel-record-jwt',
      'sentinel-request-token',
      'sentinel-url-secret',
    ];

    const lineOf = (label: string) =>
      stdout
        .split('\n')
        .find((line) => line.trim().startsWith(label))
        ?.trim();
    /** The line under a heading, such as "API requests:" then "Credential:". */
    const sectionLine = (heading: string, label: string) => {
      const lines = stdout.split('\n');
      const start = lines.indexOf(heading);
      return lines
        .slice(start + 1)
        .find((line) => line.trim().startsWith(label))
        ?.trim();
    };

    /** Every line of a section, such as "Recording:", that starts with label. */
    const sectionLines = (heading: string, label: string) => {
      const lines = stdout.split('\n');
      const section = lines.slice(lines.indexOf(heading) + 1);
      return section
        .slice(0, section.indexOf(''))
        .map((line) => line.trim())
        .filter((line) => line.startsWith(label));
    };

    it('reports an empty environment, exits 0 and sends nothing', async () => {
      vi.stubEnv('CURRENTS_PROJECT_ID', undefined);

      expect(await run(['status'])).toBe(0);

      expect(lineOf('CI provider:')).toBe('CI provider: none');
      expect(lineOf('Project:')).toBe('Project: not set');
      expect(sectionLine('API requests:', 'Credential:')).toBe(
        'Credential: none'
      );
      expect(sectionLine('API requests:', 'OIDC audience:')).toBe(
        'OIDC audience: currents:api (default)'
      );
      expect(sectionLine('Recording:', 'Credential:')).toBe('Credential: none');
      expect(sectionLine('Recording:', 'OIDC audience:')).toBe(
        'OIDC audience: currents:record-key (default)'
      );
      expect(lineOf('CURRENTS_API_KEY:')).toBe('CURRENTS_API_KEY: not set');
      expect(stderr).toBe('');
      expect(server.requests).toEqual([]);
    });

    it('says where exchange takes its token, without the token or its claims', async () => {
      expect(await run(['status'])).toBe(0);
      expect(lineOf('ci auth exchange:')).toBe(
        'ci auth exchange: the token from --stdin, or else CURRENTS_OIDC_TOKEN (not set); its audience or --for picks the credential'
      );

      stdout = '';
      vi.stubEnv('CURRENTS_OIDC_TOKEN', jwtFor('currents:api:sentinel'));
      expect(await run(['status'])).toBe(0);
      expect(lineOf('ci auth exchange:')).toContain(
        'CURRENTS_OIDC_TOKEN (set)'
      );
      expect(stdout).not.toContain('sentinel');
      expect(stdout).not.toContain(jwtFor('currents:api:sentinel'));
    });

    it('reports GitHub Actions OIDC only with both request variables', async () => {
      setGitHubEnv();
      await run(['status']);
      expect(lineOf('CI provider:')).toBe('CI provider: githubActions');
      expect(sectionLine('API requests:', 'Credential:')).toBe(
        'Credential: none'
      );
      expect(stdout).not.toContain('id-token: write');

      stdout = '';
      vi.stubEnv('ACTIONS_ID_TOKEN_REQUEST_TOKEN', undefined);
      await run(['status']);
      expect(stdout).toContain('needs `permissions: id-token: write`');
      expect(server.requests).toEqual([]);
    });

    it('prints no value of a key, token or request variable, also with --debug', async () => {
      setGitHubEnv();
      vi.stubEnv(
        'ACTIONS_ID_TOKEN_REQUEST_URL',
        'https://x/?t=sentinel-url-secret'
      );
      vi.stubEnv('ACTIONS_ID_TOKEN_REQUEST_TOKEN', 'sentinel-request-token');
      vi.stubEnv('CURRENTS_API_KEY', 'sentinel-api-key');
      vi.stubEnv('CURRENTS_RECORD_KEY', 'sentinel-record-key');
      vi.stubEnv('CURRENTS_OIDC_API_TOKEN', 'sentinel-api-jwt');
      vi.stubEnv('CURRENTS_OIDC_TOKEN', 'sentinel-record-jwt');

      expect(await run(['status', '--debug'])).toBe(0);

      const output = stdout + stderr;
      expect(SENTINELS.filter((value) => output.includes(value))).toEqual([]);
      expect(output).not.toContain('::add-mask::');
      for (const name of [
        'CURRENTS_API_KEY',
        'CURRENTS_RECORD_KEY',
        'CURRENTS_OIDC_TOKEN',
        'ACTIONS_ID_TOKEN_REQUEST_URL',
        'ACTIONS_ID_TOKEN_REQUEST_TOKEN',
      ]) {
        expect(lineOf(`${name}:`)).toBe(`${name}: set`);
      }
    });

    it('reports the audiences: defaults, then variables; a blank variable is ignored', async () => {
      vi.stubEnv('CURRENTS_OIDC_API_AUDIENCE', 'env-api');
      vi.stubEnv('CURRENTS_OIDC_AUDIENCE', ' ');
      await run(['status']);
      expect(sectionLine('API requests:', 'OIDC audience:')).toBe(
        'OIDC audience: env-api (CURRENTS_OIDC_API_AUDIENCE)'
      );
      expect(sectionLine('Recording:', 'OIDC audience:')).toBe(
        'OIDC audience: currents:record-key (default)'
      );
      expect(lineOf('CURRENTS_OIDC_AUDIENCE:')).toBe(
        'CURRENTS_OIDC_AUDIENCE: set (empty)'
      );

      stdout = '';
      vi.stubEnv('CURRENTS_OIDC_AUDIENCE', 'env-record');
      await run(['status']);
      expect(sectionLine('Recording:', 'OIDC audience:')).toBe(
        'OIDC audience: env-record (CURRENTS_OIDC_AUDIENCE)'
      );
    });

    it('reports the project and its source, the flag over the variable', async () => {
      await run(['status']);
      expect(lineOf('Project:')).toBe('Project: p1 (CURRENTS_PROJECT_ID)');

      stdout = '';
      await run(['status', '--project-id', 'flag-project']);
      expect(lineOf('Project:')).toBe('Project: flag-project (--project-id)');
    });

    it('reports the keys by flag or variable, the record key first for recording, and the API key only for the recording commands with --api-key', async () => {
      setGitHubEnv();
      vi.stubEnv('CURRENTS_API_KEY', 'sentinel-api-key');
      await run(['status']);
      expect(sectionLine('API requests:', 'Credential:')).toBe(
        'Credential: CURRENTS_API_KEY'
      );
      // Only the recording commands with --api-key use it.
      expect(sectionLines('Recording:', 'Credential:')).toEqual([
        'Credential: none (run upload, run cancel, cache set, cache get)',
        'Credential: CURRENTS_API_KEY (run attach, session start, session attach, session share)',
      ]);

      stdout = '';
      vi.stubEnv('CURRENTS_RECORD_KEY', 'sentinel-record-key');
      await run(['status', '--api-key', 'sentinel-api-key-flag']);
      expect(sectionLine('API requests:', 'Credential:')).toBe(
        'Credential: --api-key'
      );
      expect(sectionLine('Recording:', 'Credential:')).toBe(
        'Credential: CURRENTS_RECORD_KEY'
      );

      stdout = '';
      await run(['status', '--key', 'sentinel-record-key-flag']);
      expect(sectionLine('Recording:', 'Credential:')).toBe(
        'Credential: --key'
      );
      expect(stdout).not.toContain('sentinel');
    });

    it('requests, exchanges and revokes nothing, and does not read stdin', async () => {
      setGitHubEnv();
      vi.stubEnv('ACTIONS_ID_TOKEN_REQUEST_URL', 'not a url');
      vi.stubEnv('CURRENTS_OIDC_TOKEN', 'not.a.jwt');
      vi.stubEnv('CURRENTS_API_URL', 'http://127.0.0.1:1');
      const stdin = setStdin(JWT);

      expect(await run(['status'])).toBe(0);

      expect(server.requests).toEqual([]);
      expect(stdin).not.toHaveBeenCalled();
    });
  });

  describe('parser errors', () => {
    describe.each([
      ['off GitHub Actions', () => {}],
      ['on GitHub Actions', setGitHubEnv],
    ])('%s', (_name, setEnv) => {
      it.each([
        [
          ['status', '--oidc-token=sentinel-secret'],
          'unknown option (run with --help',
        ],
        [
          [
            'get-oidc-token',
            ...GITHUB,
            '--for',
            'api',
            '--oidc-token=sentinel-secret',
          ],
          'unknown option (run with --help',
        ],
        [
          ['exchange', '--for', 'api', '--stdin=sentinel-secret'],
          'unknown option (run with --help',
        ],
        [
          ['get-api-token', ...GITHUB, '--token=sentinel-secret'],
          'unknown option (run with --help',
        ],
        [
          ['get-record-key', ...GITHUB, '-Xsentinel-secret'],
          'unknown option (run with --help',
        ],
        [['revoke', '-Tsentinel-secret'], 'unknown option (run with --help'],
        [
          ['exchange', '--for', 'sentinel-secret'],
          'argument is invalid. Allowed choices are api, record.',
        ],
        [
          ['get-oidc-token', '--for=sentinel-secret'],
          'argument is invalid. Allowed choices are api, record.',
        ],
        [['sentinel-secret'], 'error: unknown command'],
        // Commander does not escape quotes in the value it repeats.
        [
          ['status', "--oidc-token='sentinel-secret"],
          'unknown option (run with --help',
        ],
        [
          ['get-record-key', ...GITHUB, "--oidc-token=foo'sentinel-secret"],
          'unknown option (run with --help',
        ],
        [
          ['get-api-token', ...GITHUB, "--x'sentinel-secret"],
          'unknown option (run with --help',
        ],
        [['revoke', "-T'sentinel-secret"], 'unknown option (run with --help'],
        [["--'sentinel-secret"], 'unknown option'],
        [
          ['get-oidc-token', '--for', "'sentinel-secret"],
          'argument is invalid',
        ],
        [['exchange', "--for='sentinel-secret"], 'argument is invalid'],
        [['exchange', '--for', "foo'sentinel-secret"], 'argument is invalid'],
        [["'sentinel-secret"], 'error: unknown command'],
        // An unknown option name can be the token itself.
        [['status', '--crnts_ciapi_sentinel-secret'], 'unknown option'],
        [['get-api-token', ...GITHUB, '--sentinel-secret'], 'unknown option'],
        [['--sentinel-secret'], 'unknown option'],
      ])('%j does not repeat the value', async (args, message) => {
        setEnv();

        expect(await run(args)).toBe(1);

        expect(stdout).toBe('');
        expect(stderr).toContain(message);
        expect(stderr).not.toContain('sentinel-secret');
        expect(server.requests).toEqual([]);
      });
    });

    it('keeps the messages that hold no value', () => {
      const command = new Command();
      for (const [message, code] of [
        [
          "error: required option '--for <kind>' not specified",
          'commander.missingMandatoryOptionValue',
        ],
        [
          "error: too many arguments for 'revoke'. Expected 0 arguments but got 1.",
          'commander.excessArguments',
        ],
      ]) {
        expect(messageWithoutValues(command, message, code)).toBe(message);
      }
    });
  });

  describe('blank inputs', () => {
    it('still warns when a key flag wins over its variable', async () => {
      vi.stubEnv('CURRENTS_API_KEY', 'sentinel-api-key');

      await run(['status', '--api-key', 'other']);

      expect(stderr).toContain(
        '--api-key and CURRENTS_API_KEY are set to different values'
      );
    });

    it('a blank --audience falls back to the variable, then the default', async () => {
      setGitHubEnv();
      vi.stubEnv('CURRENTS_OIDC_API_AUDIENCE', 'env-api');
      await run(['get-api-token', ...GITHUB, '--audience', ' ']);
      await run([
        'get-oidc-token',
        ...GITHUB,
        '--for',
        'api',
        '--audience',
        '',
      ]);
      vi.stubEnv('CURRENTS_OIDC_API_AUDIENCE', ' ');
      await run(['get-api-token', ...GITHUB, '--audience', ' ']);

      expect(githubAudiences()).toEqual(['env-api', 'env-api', 'currents:api']);
    });

    it('a blank --audience for a record key falls back to the variable', async () => {
      setGitHubEnv();
      vi.stubEnv('CURRENTS_OIDC_AUDIENCE', 'env-record');

      await run(['get-record-key', ...GITHUB, '--audience', ' ']);

      expect(githubAudiences()).toEqual(['env-record']);
    });

    it.each([
      [['--api-key', ' '], '--api-key is empty'],
      [['--api-key='], '--api-key is empty'],
      [['--key', ''], '--key is empty'],
    ])('status refuses the blank key flag %j', async (args, message) => {
      setGitHubEnv();
      vi.stubEnv('CURRENTS_API_KEY', 'sentinel-api-key');
      vi.stubEnv('CURRENTS_RECORD_KEY', 'sentinel-record-key');
      vi.stubEnv('CURRENTS_OIDC_API_TOKEN', JWT);

      expectFailure(await run(['status', ...args]));

      expect(diagnostics()).toContain(message);
      expect(diagnostics()).not.toContain('sentinel');
    });

    it('status reports a blank key variable as set but empty: no credential for API requests, the key for recording commands with --api-key', async () => {
      vi.stubEnv('CURRENTS_API_KEY', ' ');

      expect(await run(['status'])).toBe(0);

      expect(stdout).toContain('CURRENTS_API_KEY: set (empty)');
      const credentials = stdout
        .split('\n')
        .filter((line) => line.trim().startsWith('Credential:'));
      // API requests, then recording. getAuthHeaders takes any non-empty value.
      expect(credentials).toEqual([
        '  Credential: none',
        '  Credential: none (run upload, run cancel, cache set, cache get)',
        '  Credential: CURRENTS_API_KEY (run attach, session start, session attach, session share)',
      ]);
    });
  });
});
