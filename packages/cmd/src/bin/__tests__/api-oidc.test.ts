import { mkdtemp, readdir, readFile, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
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
import {
  ApiServer,
  RecordedRequest,
  Response,
  startApiServer,
} from '../../test-utils/api-server';
import { runCli } from '../../test-utils/cli';
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

// The characters change when the token is URL-encoded.
const JWT = 'provider/jwt+1=';
const API_TOKEN = 'crnts_ciapi_test';
const REQUEST_SECRET = 'request-secret';
const CONFIGURED_KEY = 'configured-key';
const RUN = { status: 'OK', data: { id: 'r1' } };
const FOUND_RUN = {
  status: 'OK',
  data: { id: 'r1', pwLastRun: { status: 'failed', failedTests: ['t1'] } },
};

const exchangeResponse = (credential: string): Response => ({
  status: 200,
  json: {
    access_token: credential,
    issued_token_type: 'urn:ietf:params:oauth:token-type:access_token',
    token_type: 'Bearer',
    expires_in: 600,
    scope: 'runs:read',
  },
});

const formBody = (request: RecordedRequest) =>
  Object.fromEntries(new URLSearchParams(request.body.toString()));
const pathOf = (request: RecordedRequest) => request.url.split('?')[0];
const MASK_LINE = /^::add-mask::.*\n?/gm;

const API = ['api', '/v1/runs/r1'];
const RUN_GET = ['run', 'get', '--ci-build-id', 'b1'];
const API_GET_RUN = ['api', 'get-run', '--ci-build-id', 'b1'];
const commands: [string, string[], string][] = [
  ['api', API, '/v1/runs/r1'],
  ['run get', RUN_GET, '/v1/runs/find'],
  ['api get-run', API_GET_RUN, '/v1/runs/find'],
];

describe('API commands with an API token from OIDC', () => {
  let director: ApiServer;
  let rest: ApiServer;
  let redirectTarget: ApiServer;
  let responses: Record<string, Response[]>;
  // stdout, stderr and the requests the servers got, in order.
  let trace: string[];
  let stdout: string;
  let stderr: string;

  const requestsTo = (path: string) =>
    [...director.requests, ...rest.requests].filter((r) => pathOf(r) === path);
  const requestLines = () => trace.filter((l) => l.startsWith('request '));
  const diagnostics = () => stderr.replace(MASK_LINE, '');
  const secretsIn = (text: string) =>
    [JWT, API_TOKEN, REQUEST_SECRET, CONFIGURED_KEY]
      .flatMap((secret) => [secret, encodeURIComponent(secret)])
      .filter((secret) => text.includes(secret));

  const defaultResponse = (path: string): Response => {
    if (path === '/github-token') return { status: 200, json: { value: JWT } };
    if (path === '/oidc/api/token') return exchangeResponse(API_TOKEN);
    if (path === '/oidc/api/revoke') return { status: 200 };
    if (path === '/v1/runs/r1') return { status: 200, json: RUN };
    if (path === '/v1/runs/find') return { status: 200, json: FOUND_RUN };
    return { status: 404 };
  };
  const responder = (server: string) => (request: RecordedRequest) => {
    const path = pathOf(request);
    trace.push(`request ${server}${path}`);
    return responses[path]?.shift() ?? defaultResponse(path);
  };

  beforeAll(async () => {
    director = await startApiServer(responder('director'));
    rest = await startApiServer(responder('rest'));
    redirectTarget = await startApiServer(() => ({ status: 200 }));
    // The HTTP clients read the base URLs once, when they are first used.
    process.env.CURRENTS_API_URL = director.url;
    process.env.CURRENTS_REST_API_URL = rest.url;
  });

  afterAll(async () => {
    delete process.env.CURRENTS_API_URL;
    delete process.env.CURRENTS_REST_API_URL;
    await Promise.all([director, rest, redirectTarget].map((s) => s.close()));
  });

  beforeEach(() => {
    director.requests.length = 0;
    rest.requests.length = 0;
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
      'CURRENTS_CI_BUILD_ID',
      'CURRENTS_OUTPUT',
      'CURRENTS_DEBUG',
      'CURRENTS_OIDC_TOKEN',
      'CURRENTS_OIDC_API_TOKEN',
      'CURRENTS_OIDC_AUDIENCE',
      'CURRENTS_OIDC_API_AUDIENCE',
      'ACTIONS_ID_TOKEN_REQUEST_URL',
      'ACTIONS_ID_TOKEN_REQUEST_TOKEN',
      'GITHUB_ACTIONS',
      'GITLAB_CI',
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
    for (const method of ['log', 'error', 'warn'] as const) {
      vi.spyOn(console, method).mockImplementation((...args) => {
        stderr += `${args.join(' ')}\n`;
      });
    }
    vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new ExitError(code);
    }) as never);
  });

  afterEach(() => {
    disableDebug();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  const setGitHubEnv = () => {
    vi.stubEnv('GITHUB_ACTIONS', 'true');
    vi.stubEnv(
      'ACTIONS_ID_TOKEN_REQUEST_URL',
      `${director.url}/github-token?api-version=2.0`
    );
    vi.stubEnv('ACTIONS_ID_TOKEN_REQUEST_TOKEN', REQUEST_SECRET);
  };

  async function run(args: string[]) {
    try {
      await getProgram().parseAsync(args, { from: 'user' });
    } catch (e) {
      if (!(e instanceof ExitError)) throw e;
      return e.code;
    }
    return undefined;
  }

  const authorizationOf = (path: string) =>
    requestsTo(path).map((r) => r.headers.authorization);

  /** Exit 1, no request to the REST API, no revoke and no secret in the diagnostics. */
  const expectStopped = (code: number | undefined) => {
    expect(code).toBe(1);
    expect(stdout).toBe('');
    expect(rest.requests).toEqual([]);
    expect(requestsTo('/oidc/api/revoke')).toEqual([]);
    expect(secretsIn(diagnostics())).toEqual([]);
  };

  describe.each(commands)('%s', (_name, args, restPath) => {
    it('gets the GitHub token for currents:api, exchanges it, uses the API token and revokes it on exit', async () => {
      setGitHubEnv();

      expect(await run(args)).toBe(0);

      expect(requestLines()).toEqual([
        'request director/github-token',
        'request director/oidc/api/token',
        `request rest${restPath}`,
        'request director/oidc/api/revoke',
      ]);
      const [github] = requestsTo('/github-token');
      const githubUrl = new URL(github.url, director.url);
      expect(githubUrl.searchParams.get('audience')).toBe('currents:api');
      expect(githubUrl.searchParams.get('api-version')).toBe('2.0');
      expect(github.headers.authorization).toBe(`bearer ${REQUEST_SECRET}`);
      expect(formBody(requestsTo('/oidc/api/token')[0])).toEqual({
        grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
        subject_token: JWT,
        subject_token_type: 'urn:ietf:params:oauth:token-type:jwt',
        project_id: 'p1',
      });
      expect(authorizationOf(restPath)).toEqual([`Bearer ${API_TOKEN}`]);
      expect(formBody(requestsTo('/oidc/api/revoke')[0])).toEqual({
        token: API_TOKEN,
        token_type_hint: 'access_token',
      });
      expect(requestsTo('/oidc/token')).toEqual([]);
      expect(requestsTo('/oidc/revoke')).toEqual([]);
      // The output comes before the revoke.
      const output = trace.findIndex((l) => l.startsWith('stdout '));
      expect(output).toBeGreaterThan(-1);
      expect(output).toBeLessThan(
        trace.indexOf('request director/oidc/api/revoke')
      );
      expect(stdout).toBe(
        restPath === '/v1/runs/r1'
          ? JSON.stringify(RUN)
          : `${JSON.stringify(FOUND_RUN.data, null, 2)}\n`
      );
      expect(diagnostics()).toContain(
        'Using an API token from the GitHub Actions OIDC token'
      );
      expect(secretsIn(diagnostics())).toEqual([]);
    });

    it('exchanges CURRENTS_OIDC_API_TOKEN without asking GitHub', async () => {
      setGitHubEnv();
      vi.stubEnv('CURRENTS_OIDC_API_TOKEN', 'env-jwt');

      expect(await run(args)).toBe(0);

      expect(requestsTo('/github-token')).toEqual([]);
      expect(formBody(requestsTo('/oidc/api/token')[0]).subject_token).toBe(
        'env-jwt'
      );
      expect(authorizationOf(restPath)).toEqual([`Bearer ${API_TOKEN}`]);
      expect(requestsTo('/oidc/api/revoke')).toHaveLength(1);
    });

    it.each([
      ['--api-key', () => [CONFIGURED_KEY]],
      [
        'CURRENTS_API_KEY',
        () => {
          vi.stubEnv('CURRENTS_API_KEY', CONFIGURED_KEY);
          return [];
        },
      ],
      [
        '--api-key over a different CURRENTS_API_KEY',
        () => {
          vi.stubEnv('CURRENTS_API_KEY', 'env-key');
          return [CONFIGURED_KEY];
        },
      ],
    ])(
      'uses the key from %s and sends no OIDC request',
      async (_source, setUp) => {
        setGitHubEnv();
        vi.stubEnv('CURRENTS_OIDC_API_TOKEN', JWT);
        const key = setUp();

        const flag = key.length ? ['--api-key', ...key] : [];
        expect(await run([...args, ...flag])).toBe(0);

        expect(authorizationOf(restPath)).toEqual([`Bearer ${CONFIGURED_KEY}`]);
        expect(director.requests).toEqual([]);
      }
    );

    it('keeps an API token from get-api-token in CURRENTS_API_KEY: no exchange, no revoke', async () => {
      setGitHubEnv();
      vi.stubEnv('CURRENTS_API_KEY', 'crnts_ciapi_exported');

      expect(await run(args)).toBe(0);

      expect(authorizationOf(restPath)).toEqual([
        'Bearer crnts_ciapi_exported',
      ]);
      expect(director.requests).toEqual([]);
    });

    it('reports a key the API refuses, without falling back to OIDC', async () => {
      setGitHubEnv();
      vi.stubEnv('CURRENTS_API_KEY', 'env-key');
      responses[restPath] = [{ status: 401, json: { message: 'no' } }];

      expect(await run([...args, '--api-key', CONFIGURED_KEY])).toBe(1);

      expect(authorizationOf(restPath)).toEqual([`Bearer ${CONFIGURED_KEY}`]);
      expect(director.requests).toEqual([]);
      expect(secretsIn(diagnostics())).toEqual([]);
    });

    it('asks for the API audience: --oidc-api-audience, then CURRENTS_OIDC_API_AUDIENCE, never the record audience', async () => {
      setGitHubEnv();
      vi.stubEnv('CURRENTS_OIDC_AUDIENCE', 'record-audience');
      await run(args);
      vi.stubEnv('CURRENTS_OIDC_API_AUDIENCE', 'env-api');
      await run(args);
      await run([...args, '--oidc-api-audience', 'flag api&x=1']);

      expect(
        requestsTo('/github-token').map((r) =>
          new URL(r.url, director.url).searchParams.get('audience')
        )
      ).toEqual(['currents:api', 'env-api', 'flag api&x=1']);
    });

    it('exchanges for the --project-id over CURRENTS_PROJECT_ID', async () => {
      setGitHubEnv();

      await run([...args, '--project-id', 'p2']);

      expect(formBody(requestsTo('/oidc/api/token')[0]).project_id).toBe('p2');
    });

    it('requires the project before getting any token', async () => {
      setGitHubEnv();
      vi.stubEnv('CURRENTS_PROJECT_ID', '  ');

      expectStopped(await run(args));

      expect(director.requests).toEqual([]);
      expect(diagnostics()).toContain('--project-id');
      expect(diagnostics()).toContain('CURRENTS_PROJECT_ID');
    });

    it.each([
      ['nothing', () => {}],
      [
        'only CURRENTS_OIDC_TOKEN',
        () => vi.stubEnv('CURRENTS_OIDC_TOKEN', JWT),
      ],
      [
        'only CURRENTS_RECORD_KEY',
        () => vi.stubEnv('CURRENTS_RECORD_KEY', 'record-key'),
      ],
      [
        'GitHub request variables outside GitHub Actions',
        () => {
          setGitHubEnv();
          vi.stubEnv('GITHUB_ACTIONS', undefined);
        },
      ],
    ])('says how to authenticate when there is %s', async (_name, setUp) => {
      setUp();

      expectStopped(await run(args));

      expect(director.requests).toEqual([]);
      expect(diagnostics()).toContain('API key is required');
      expect(diagnostics()).toContain('CURRENTS_OIDC_API_TOKEN');
      expect(diagnostics()).toContain('id-token: write');
    });

    it('treats a blank CURRENTS_API_KEY as unset', async () => {
      vi.stubEnv('CURRENTS_API_KEY', ' ');
      vi.stubEnv('CURRENTS_OIDC_API_TOKEN', JWT);

      expect(await run(args)).toBe(0);

      expect(authorizationOf(restPath)).toEqual([`Bearer ${API_TOKEN}`]);
    });

    it('fails on a blank --api-key instead of exchanging', async () => {
      vi.stubEnv('CURRENTS_OIDC_API_TOKEN', JWT);

      expectStopped(await run([...args, '--api-key', '']));

      expect(director.requests).toEqual([]);
    });

    it('revokes the API token when the REST API fails, and keeps exit 1', async () => {
      setGitHubEnv();
      responses[restPath] = [{ status: 403, json: { message: 'denied' } }];

      expect(await run(args)).toBe(1);

      expect(requestsTo('/oidc/api/token')).toHaveLength(1);
      expect(requestsTo(restPath)).toHaveLength(1);
      expect(requestsTo('/oidc/api/revoke')).toHaveLength(1);
      expect(stdout).toBe('');
    });

    it('exchanges once for a request the client retries', async () => {
      setGitHubEnv();
      responses[restPath] = [{ status: 503 }];

      expect(await run(args)).toBe(0);

      expect(requestsTo(restPath)).toHaveLength(2);
      expect(authorizationOf(restPath)).toEqual([
        `Bearer ${API_TOKEN}`,
        `Bearer ${API_TOKEN}`,
      ]);
      expect(requestsTo('/oidc/api/token')).toHaveLength(1);
    });

    it('exchanges again on every invocation, each revoking its own token', async () => {
      setGitHubEnv();
      responses['/oidc/api/token'] = [
        exchangeResponse('crnts_ciapi_one'),
        exchangeResponse('crnts_ciapi_two'),
      ];

      await run(args);
      await run(args);

      expect(authorizationOf(restPath)).toEqual([
        'Bearer crnts_ciapi_one',
        'Bearer crnts_ciapi_two',
      ]);
      expect(
        requestsTo('/oidc/api/revoke').map((r) => formBody(r).token)
      ).toEqual(['crnts_ciapi_one', 'crnts_ciapi_two']);
    });

    it('masks the GitHub token and the API token before the request', async () => {
      setGitHubEnv();

      await run(args);

      const maskJwt = trace.indexOf(`stderr ::add-mask::${JWT}\n`);
      const exchange = trace.indexOf('request director/oidc/api/token');
      const maskToken = trace.indexOf(`stderr ::add-mask::${API_TOKEN}\n`);
      const use = trace.indexOf(`request rest${restPath}`);
      expect(maskJwt).toBeGreaterThan(-1);
      expect(maskJwt).toBeLessThan(exchange);
      expect(maskToken).toBeGreaterThan(exchange);
      expect(maskToken).toBeLessThan(use);
    });

    it('keeps the secrets out of the debug log', async () => {
      setGitHubEnv();

      expect(await run([...args, '--debug'])).toBe(0);

      expect(stderr).toContain('network request');
      expect(secretsIn(diagnostics())).toEqual([]);
      expect(secretsIn(stdout)).toEqual([]);
    });

    it('stops before the REST API when the exchange fails', async () => {
      setGitHubEnv();
      responses['/oidc/api/token'] = [
        {
          status: 400,
          json: {
            error: 'invalid_grant',
            error_description: `bad audience ${JWT}`,
          },
        },
      ];

      expectStopped(await run(args));

      expect(diagnostics()).toContain('bad audience *****');
    });
  });

  describe.each([[[]], [['--debug']]])(
    'stops before the REST API, %s',
    (extraArgs) => {
      it.each<[string, string, Response[]]>([
        [
          'GitHub answers 500, every time',
          '/github-token',
          Array(5).fill({ status: 500 }),
        ],
        ['GitHub sends no token', '/github-token', [{ status: 200, json: {} }]],
        [
          'GitHub repeats the request token in a 400',
          '/github-token',
          [{ status: 400, json: { message: `bad ${REQUEST_SECRET}` } }],
        ],
        [
          'the exchange answers 401',
          '/oidc/api/token',
          [{ status: 401, json: {} }],
        ],
        [
          'the exchange answers without a token',
          '/oidc/api/token',
          [{ status: 200, json: { expires_in: 600 } }],
        ],
        [
          'the exchange answers 503, every time',
          '/oidc/api/token',
          Array(5).fill({ status: 503 }),
        ],
        [
          'the exchange closes the connection, every time',
          '/oidc/api/token',
          Array(5).fill({ destroy: true }),
        ],
        ...[307, 308].map((status): [string, string, Response[]] => [
          `the exchange redirects with ${status}`,
          '/oidc/api/token',
          [{ status, headers: { location: 'REDIRECT' }, body: '' }],
        ]),
      ])('when %s', async (_name, path, list) => {
        setGitHubEnv();
        responses[path] = list.map((r) =>
          'headers' in r && r.headers?.location === 'REDIRECT'
            ? { ...r, headers: { location: `${redirectTarget.url}/x` } }
            : r
        );

        expectStopped(await run([...API, ...extraArgs]));

        expect(redirectTarget.requests).toEqual([]);
        expect(requestsTo('/oidc/token')).toEqual([]);
      });
    }
  );

  describe('api', () => {
    it('sends no OIDC request for an explicit Authorization header', async () => {
      setGitHubEnv();

      await run([
        ...API,
        '--api-key',
        CONFIGURED_KEY,
        '-H',
        'authorization: Bearer x',
      ]);
      expect(authorizationOf('/v1/runs/r1')).toEqual(['Bearer x']);

      // Without a key the header alone is not enough, as before.
      expect(await run([...API, '-H', 'Authorization: Bearer x'])).toBe(1);
      expect(diagnostics()).toContain('API key is required');
      expect(director.requests).toEqual([]);
    });

    it('needs no project when a key is set', async () => {
      vi.stubEnv('CURRENTS_PROJECT_ID', undefined);

      expect(await run([...API, '--api-key', CONFIGURED_KEY])).toBe(0);
    });

    it('hides the API token in a REST error that repeats it', async () => {
      setGitHubEnv();
      vi.stubEnv('GITHUB_ACTIONS', undefined);
      vi.stubEnv('CURRENTS_OIDC_API_TOKEN', JWT);
      responses['/v1/runs/r1'] = [
        {
          status: 401,
          json: { message: `bad Bearer ${API_TOKEN}` },
        },
      ];

      expect(await run([...API, '--include'])).toBe(1);

      expect(diagnostics()).toContain('bad Bearer *****');
      expect(secretsIn(diagnostics())).toEqual([]);
      expect(requestsTo('/oidc/api/revoke')).toHaveLength(1);
    });
  });

  describe('run get', () => {
    it.each([
      [
        'run get with --ci-build-id and --branch',
        [...RUN_GET, '--branch', 'main'],
      ],
      [
        'api get-run with --ci-build-id and --branch',
        [...API_GET_RUN, '--branch', 'main'],
      ],
      ['run get without a selector', ['run', 'get']],
    ])('gets no token for %s', async (_name, args) => {
      setGitHubEnv();

      expectStopped(await run(args));

      expect(director.requests).toEqual([]);
      expect(diagnostics()).toContain(
        'Pass --ci-build-id, or --branch, --tag or both'
      );
    });

    it('writes only the run to --output and revokes the token', async () => {
      setGitHubEnv();
      const dir = await mkdtemp(join(tmpdir(), 'api-oidc-'));
      try {
        const file = join(dir, 'run.json');

        expect(await run([...RUN_GET, '--output', file])).toBe(0);

        expect(JSON.parse(await readFile(file, 'utf8'))).toEqual(
          FOUND_RUN.data
        );
        expect(await readdir(dir)).toEqual(['run.json']);
        expect(requestsTo('/oidc/api/revoke')).toHaveLength(1);
      } finally {
        await rm(dir, { recursive: true });
      }
    });

    it('revokes the token when the run has no pwLastRun', async () => {
      setGitHubEnv();
      responses['/v1/runs/find'] = [
        { status: 200, json: { status: 'OK', data: { id: 'r1' } } },
      ];

      expect(await run([...RUN_GET, '--pw-last-run'])).toBe(1);

      expect(stdout).toBe('');
      expect(requestsTo('/oidc/api/revoke')).toHaveLength(1);
    });

    it.each([[[]], [['--debug']]])(
      'hides the API token in a REST error that repeats it, %s',
      async (extraArgs) => {
        vi.stubEnv('CURRENTS_OIDC_API_TOKEN', JWT);
        responses['/v1/runs/find'] = [
          { status: 400, json: { message: `bad Bearer ${API_TOKEN}` } },
        ];

        expect(await run([...RUN_GET, ...extraArgs])).toBe(1);

        expect(secretsIn(diagnostics())).toEqual([]);
      }
    );

    it('revokes the token when the REST API cannot be reached', async () => {
      setGitHubEnv();
      responses['/v1/runs/find'] = Array(5).fill({ destroy: true });

      expect(await run(RUN_GET)).toBe(1);

      expect(requestsTo('/oidc/api/token')).toHaveLength(1);
      expect(requestsTo('/oidc/api/revoke')).toHaveLength(1);
    });
  });

  describe.each([
    ['succeeds', 0, undefined],
    ['fails', 1, { status: 500 } as Response],
  ])('when the command %s', (_name, exitCode, restResponse) => {
    it.each<[string, Response]>([
      [
        'a 400',
        { status: 400, json: { error_description: `bad ${API_TOKEN}` } },
      ],
      ['a 500', { status: 500 }],
      ['a closed connection', { destroy: true }],
      ...[307, 308].map((status): [string, Response] => [
        `a ${status} redirect`,
        { status, headers: { location: 'REDIRECT' }, body: '' },
      ]),
    ])(
      'a revoke that gets %s is tried once and keeps the exit code',
      async (_n, response) => {
        setGitHubEnv();
        if (restResponse)
          responses['/v1/runs/r1'] = Array(5).fill(restResponse);
        responses['/oidc/api/revoke'] = [
          'headers' in response && response.headers?.location === 'REDIRECT'
            ? { ...response, headers: { location: `${redirectTarget.url}/x` } }
            : response,
        ];

        expect(await run([...API, '--debug'])).toBe(exitCode);

        expect(requestsTo('/oidc/api/revoke')).toHaveLength(1);
        expect(redirectTarget.requests).toEqual([]);
        expect(stdout).toBe(exitCode === 0 ? JSON.stringify(RUN) : '');
        expect(secretsIn(diagnostics())).toEqual([]);
      }
    );
  });

  it('gives up on the revoke after 5 seconds and keeps exit 0', async () => {
    setGitHubEnv();
    responses['/oidc/api/revoke'] = [{ hang: true }];
    const start = Date.now();

    expect(await run(API)).toBe(0);

    expect(Date.now() - start).toBeLessThan(7000);
    expect(stdout).toBe(JSON.stringify(RUN));
    expect(requestsTo('/oidc/api/revoke')).toHaveLength(1);
  }, 10_000);

  it('does not get a token for --help', async () => {
    setGitHubEnv();

    for (const args of [
      [...API, '--help'],
      ['run', 'get', '--help'],
    ]) {
      await run(args);
    }

    expect(director.requests).toEqual([]);
  });
});

// The built CLI, for what only a real process shows: the exit hook runs
// before the process exits, and nothing is written to disk.
describe('currents api in a process', () => {
  let director: ApiServer;
  let rest: ApiServer;
  let dir: string;
  let revoke: Response;

  beforeAll(async () => {
    director = await startApiServer((request) => {
      const path = pathOf(request);
      if (path === '/oidc/api/token') return exchangeResponse(API_TOKEN);
      if (path === '/oidc/api/revoke') return revoke;
      return { status: 404 };
    });
    rest = await startApiServer(() => ({ status: 200, json: RUN }));
  });

  afterAll(async () => {
    await director.close();
    await rest.close();
  });

  beforeEach(async () => {
    director.requests.length = 0;
    rest.requests.length = 0;
    revoke = { status: 200 };
    dir = await mkdtemp(join(tmpdir(), 'api-oidc-'));
  });

  afterEach(() => rm(dir, { recursive: true }));

  const env = (extra: Record<string, string> = {}) => ({
    HOME: dir,
    CURRENTS_API_URL: director.url,
    CURRENTS_REST_API_URL: rest.url,
    CURRENTS_PROJECT_ID: 'p1',
    CURRENTS_OIDC_API_TOKEN: JWT,
    ...extra,
  });

  it('revokes the API token before it exits, and writes no file', async () => {
    const result = await runCli(API, { cwd: dir, env: env() });

    expect(result.code).toBe(0);
    expect(result.stdout).toBe(JSON.stringify(RUN));
    expect(director.requests.map(pathOf)).toEqual([
      '/oidc/api/token',
      '/oidc/api/revoke',
    ]);
    expect(await readdir(dir)).toEqual([]);
  });

  it('exits with 0 about 5 seconds after a revoke that never answers', async () => {
    revoke = { hang: true };
    const start = Date.now();

    const result = await runCli(API, { cwd: dir, env: env() });

    expect(result.code).toBe(0);
    expect(result.stdout).toBe(JSON.stringify(RUN));
    expect(Date.now() - start).toBeLessThan(8000);
  }, 15_000);

  it.each([
    ['api', API],
    ['run get', RUN_GET],
  ])(
    '%s gets no token for another director without CURRENTS_REST_API_URL',
    async (_name, args) => {
      const result = await runCli(args, {
        cwd: dir,
        env: { ...env(), CURRENTS_REST_API_URL: '' },
      });

      expect(result.code).toBe(1);
      expect(result.stderr).toContain('CURRENTS_REST_API_URL is required');
      expect(rest.requests).toEqual([]);
      expect(director.requests).toEqual([]);
    }
  );
});
