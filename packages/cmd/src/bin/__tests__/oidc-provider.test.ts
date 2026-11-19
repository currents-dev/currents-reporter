import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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
import { getCacheCommandConfig } from '../../config/cache';
import { setOidcAudienceOption } from '../../http/httpConfig';
import {
  findTokenSource,
  googleMetadataRequest,
  requestGoogleMetadata,
  resetOidcExchange,
  tokenCommand,
} from '../../lib/oidc';
import {
  ApiServer,
  RecordedRequest,
  Response,
  startApiServer,
} from '../../test-utils/api-server';
import { getProgram } from '../program';

vi.mock('../../http/httpRetry', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../http/httpRetry')>()),
  getDelay: () => 1,
}));
vi.mock('../../services', () => ({
  handleCurrentsReport: vi.fn(),
  handleGetCache: vi.fn(),
  handleSetCache: vi.fn(),
  handleCancelRun: vi.fn(),
  handleGetRun: vi.fn(),
}));

class ExitError extends Error {
  constructor(public code: number | undefined) {
    super(`exit ${code}`);
  }
}

const IDENTITY_PATH =
  '/computeMetadata/v1/instance/service-accounts/default/identity';
const EMAIL_PATH =
  '/computeMetadata/v1/instance/service-accounts/default/email';
const GOOGLE_TOKEN = 'google-id-token';
const GITHUB_TOKEN = 'github-id-token';
const SA_EMAIL = 'ci@project.iam.gserviceaccount.com';

const exchangeResponse = (credential: string): Response => ({
  status: 200,
  json: { access_token: credential, expires_in: 600 },
});

describe('--oidc-provider', () => {
  // The Currents API, GitHub and the Google Cloud metadata server.
  let server: ApiServer;
  // A port where nothing listens.
  let closedHost: string;
  let responses: Record<string, Response[]>;
  let stdout: string;
  let stderr: string;

  const pathOf = (request: RecordedRequest) => request.url.split('?')[0];
  const requestsTo = (path: string) =>
    server.requests.filter((r) => pathOf(r) === path);
  const subjectToken = (path: string) =>
    new URLSearchParams(requestsTo(path)[0]?.body.toString()).get(
      'subject_token'
    );

  beforeAll(async () => {
    server = await startApiServer((request) => {
      const path = pathOf(request);
      const queued = responses[path]?.shift();
      if (queued) return queued;
      if (path === IDENTITY_PATH) return { status: 200, body: GOOGLE_TOKEN };
      if (path === EMAIL_PATH) return { status: 200, body: SA_EMAIL };
      if (path === '/github-token') {
        return { status: 200, json: { value: GITHUB_TOKEN } };
      }
      if (path === '/oidc/api/token') return exchangeResponse('crnts_ciapi_t');
      if (path === '/oidc/token') return exchangeResponse('crnts_ci_t');
      return { status: 200 };
    });
    // The HTTP client reads the base URL once, when it is first used.
    process.env.CURRENTS_API_URL = server.url;
    const closed = await startApiServer(() => ({ status: 200 }));
    closedHost = new URL(closed.url).host;
    await closed.close();
  });

  afterAll(async () => {
    delete process.env.CURRENTS_API_URL;
    await server.close();
  });

  beforeEach(() => {
    server.requests.length = 0;
    responses = {};
    stdout = '';
    stderr = '';
    resetOidcExchange();
    setOidcAudienceOption(undefined);
    googleMetadataRequest.attempts = 3;
    googleMetadataRequest.delayMs = 1;
    googleMetadataRequest.timeoutMs = 2000;
    for (const name of [
      'CURRENTS_API_KEY',
      'CURRENTS_RECORD_KEY',
      'CURRENTS_DEBUG',
      'CURRENTS_OIDC_TOKEN',
      'CURRENTS_OIDC_API_TOKEN',
      'CURRENTS_OIDC_AUDIENCE',
      'CURRENTS_OIDC_API_AUDIENCE',
      'CURRENTS_OIDC_PROVIDER',
      'ACTIONS_ID_TOKEN_REQUEST_URL',
      'ACTIONS_ID_TOKEN_REQUEST_TOKEN',
      'GITHUB_ACTIONS',
      'GITLAB_CI',
      'HTTP_PROXY',
      'http_proxy',
      'HTTPS_PROXY',
      'https_proxy',
      'NO_PROXY',
      'no_proxy',
    ]) {
      vi.stubEnv(name, undefined);
    }
    vi.stubEnv('CURRENTS_PROJECT_ID', 'p1');
    vi.stubEnv('GCE_METADATA_HOST', new URL(server.url).host);
    vi.spyOn(process.stdout, 'write').mockImplementation(((
      chunk: unknown,
      ...rest: unknown[]
    ) => {
      stdout += String(chunk);
      const callback = rest.find((arg) => typeof arg === 'function');
      (callback as (() => void) | undefined)?.();
      return true;
    }) as never);
    vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
      stderr += String(chunk);
      return true;
    });
    vi.spyOn(console, 'log').mockImplementation(() => {});
    for (const method of ['error', 'warn'] as const) {
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
    vi.stubEnv('ACTIONS_ID_TOKEN_REQUEST_URL', `${server.url}/github-token`);
    vi.stubEnv('ACTIONS_ID_TOKEN_REQUEST_TOKEN', 'request-secret');
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

  describe('the Google Cloud token', () => {
    it('is requested with the Metadata-Flavor header, the audience and format=full', async () => {
      const token = await findTokenSource('google-cloud')!.getToken(
        process.env,
        'currents:api'
      );

      expect(token).toBe(GOOGLE_TOKEN);
      const [request] = requestsTo(IDENTITY_PATH);
      expect(request.method).toBe('GET');
      expect(request.headers['metadata-flavor']).toBe('Google');
      const url = new URL(request.url, server.url);
      expect(Object.fromEntries(url.searchParams)).toEqual({
        audience: 'currents:api',
        format: 'full',
      });
    });

    it('is requested again while the metadata server does not answer', async () => {
      responses[IDENTITY_PATH] = [{ status: 503 }, { destroy: true }];

      const token = await findTokenSource('google-cloud')!.getToken(
        process.env,
        'currents:api'
      );

      expect(token).toBe(GOOGLE_TOKEN);
      expect(requestsTo(IDENTITY_PATH)).toHaveLength(3);
    });

    it('says the metadata server is unreachable after the last attempt', async () => {
      vi.stubEnv('GCE_METADATA_HOST', closedHost);

      await expect(
        findTokenSource('google-cloud')!.getToken(process.env, 'currents:api')
      ).rejects.toThrow(
        `the Google Cloud metadata server at ${closedHost} is unreachable`
      );
    });

    it('repeats the refusal of the metadata server without trying again', async () => {
      responses[IDENTITY_PATH] = [
        { status: 404, body: 'service account not found' },
      ];

      await expect(
        findTokenSource('google-cloud')!.getToken(process.env, 'currents:api')
      ).rejects.toThrow(
        'answered 404: the VM or the GKE pod may have no Google service account'
      );
      expect(requestsTo(IDENTITY_PATH)).toHaveLength(1);
    });

    it('does not follow a redirect', async () => {
      responses[IDENTITY_PATH] = [
        { status: 302, headers: { location: `${server.url}/elsewhere` } },
      ];

      await expect(
        findTokenSource('google-cloud')!.getToken(process.env, 'currents:api')
      ).rejects.toThrow('answered 302');
      expect(requestsTo('/elsewhere')).toEqual([]);
    });

    it('is not sent through the HTTP proxy', async () => {
      vi.stubEnv('HTTP_PROXY', `http://${closedHost}`);

      expect(
        await requestGoogleMetadata('instance/service-accounts/default/email')
      ).toBe(SA_EMAIL);
    });
  });

  it('uses the Google Cloud token instead of the GitHub one with the flag', async () => {
    setGitHubEnv();

    expect(
      await run([
        'ci',
        'auth',
        'get-api-token',
        '--oidc-provider',
        'google-cloud',
      ])
    ).toBe(0);

    expect(stdout).toBe('crnts_ciapi_t\n');
    expect(requestsTo('/github-token')).toEqual([]);
    expect(subjectToken('/oidc/api/token')).toBe(GOOGLE_TOKEN);
    // The GitHub mask commands hold the token on purpose.
    expect(stderr.replace(/^::add-mask::.*\n/gm, '')).not.toContain(
      GOOGLE_TOKEN
    );
  });

  it('gets the record key of a recording command from CURRENTS_OIDC_PROVIDER, with the record key audience', async () => {
    vi.stubEnv('CURRENTS_OIDC_PROVIDER', 'google-cloud');
    vi.stubEnv('CURRENTS_OIDC_AUDIENCE', 'staging:record-key');

    await run(['cache', 'set']);

    expect(getCacheCommandConfig().values?.recordKey).toBe('crnts_ci_t');
    const url = new URL(requestsTo(IDENTITY_PATH)[0].url, server.url);
    expect(url.searchParams.get('audience')).toBe('staging:record-key');
    expect(subjectToken('/oidc/token')).toBe(GOOGLE_TOKEN);
    expect(stderr).toContain(
      'Using a record key from the Google Cloud OIDC token'
    );
    expect(stderr).not.toContain(GOOGLE_TOKEN);
  });

  it('uses the API audience variable for an API token', async () => {
    vi.stubEnv('CURRENTS_OIDC_API_AUDIENCE', 'staging:api');

    vi.stubEnv('CURRENTS_REST_API_URL', server.url);

    await run(['api', '/v1/runs/r1', '--oidc-provider', 'google-cloud']);

    const url = new URL(requestsTo(IDENTITY_PATH)[0].url, server.url);
    expect(url.searchParams.get('audience')).toBe('staging:api');
  });

  it('uses a token in CURRENTS_OIDC_TOKEN before the provider', async () => {
    vi.stubEnv('CURRENTS_OIDC_TOKEN', 'job-token');

    await run(['cache', 'set', '--oidc-provider', 'google-cloud']);

    expect(requestsTo(IDENTITY_PATH)).toEqual([]);
    expect(subjectToken('/oidc/token')).toBe('job-token');
  });

  it('fails with a clear message when the metadata server is unreachable', async () => {
    vi.stubEnv('GCE_METADATA_HOST', closedHost);

    expect(
      await run([
        'ci',
        'auth',
        'get-api-token',
        '--oidc-provider',
        'google-cloud',
      ])
    ).toBe(1);

    expect(stderr).toContain(
      `Could not get the Google Cloud OIDC token: the Google Cloud metadata server at ${closedHost} is unreachable`
    );
    expect(stderr).toContain('Workload Identity');
    expect(requestsTo('/oidc/api/token')).toEqual([]);
  });

  it('fails when the GitHub provider is selected outside a job with id-token: write', async () => {
    expect(
      await run(['cache', 'set', '--oidc-provider', 'github-actions'])
    ).toBe(1);

    expect(stderr).toContain(
      'The OIDC provider is github-actions (--oidc-provider or CURRENTS_OIDC_PROVIDER), but the GitHub Actions OIDC token is not available'
    );
    expect(server.requests).toEqual([]);
  });

  it('refuses a provider it does not know', async () => {
    vi.stubEnv('CURRENTS_OIDC_PROVIDER', 'aws');

    expect(await run(['cache', 'set'])).toBe(1);

    expect(stderr).toContain(
      'Allowed choices are github-actions, google-cloud, circleci, buildkite'
    );
    expect(server.requests).toEqual([]);
  });

  describe('without a provider', () => {
    it('does not ask the metadata server', async () => {
      await run(['cache', 'set']);
      await run(['ci', 'auth', 'status']);

      expect(server.requests).toEqual([]);
      expect(stdout).toContain(
        'OIDC provider: not set; GitHub Actions is found by itself'
      );
    });

    it('still finds GitHub Actions by itself for the api command', async () => {
      setGitHubEnv();
      vi.stubEnv('CURRENTS_REST_API_URL', server.url);

      await run(['api', '/v1/runs/r1']);

      expect(requestsTo(IDENTITY_PATH)).toEqual([]);
      expect(subjectToken('/oidc/api/token')).toBe(GITHUB_TOKEN);
    });

    it.each(['get-api-token', 'get-record-key', 'get-oidc-token'])(
      'ci auth %s requires --oidc-provider, also on GitHub Actions',
      async (command) => {
        setGitHubEnv();

        expect(
          await run([
            'ci',
            'auth',
            command,
            ...(command === 'get-oidc-token' ? ['--for', 'api'] : []),
          ])
        ).toBe(1);

        expect(stderr).toContain("required option '--oidc-provider");
        expect(server.requests).toEqual([]);
      }
    );
  });

  describe('ci auth status', () => {
    it('reports the provider and the service account of the metadata server', async () => {
      vi.stubEnv('CURRENTS_OIDC_PROVIDER', 'google-cloud');

      expect(await run(['ci', 'auth', 'status'])).toBe(0);

      expect(stdout).toContain(
        'OIDC provider: google-cloud (CURRENTS_OIDC_PROVIDER)'
      );
      expect(stdout).toContain(
        `Google Cloud OIDC: the metadata server at ${new URL(server.url).host} answers; service account ${SA_EMAIL}`
      );
      expect(stdout).toContain('Credential: OIDC, Google Cloud OIDC token');
      expect(requestsTo(IDENTITY_PATH)).toEqual([]);
    });

    it('says when the metadata server is unreachable', async () => {
      vi.stubEnv('GCE_METADATA_HOST', closedHost);

      expect(
        await run(['ci', 'auth', 'status', '--oidc-provider', 'google-cloud'])
      ).toBe(0);

      expect(stdout).toContain('OIDC provider: google-cloud (--oidc-provider)');
      expect(stdout).toContain(
        `Google Cloud OIDC: the Google Cloud metadata server at ${closedHost} is unreachable`
      );
      expect(stdout).toContain('Workload Identity');
    });
  });

  describe('GCE_METADATA_HOST', () => {
    const TOKEN_ENDPOINTS = [
      '/computeMetadata/v1/instance/service-accounts/default/identity?audience=currents:api&format=full#',
      '/computeMetadata/v1/instance/service-accounts/default/token#',
    ];
    const invalidHosts = () => {
      const host = new URL(server.url).host;
      return [
        ...TOKEN_ENDPOINTS.map((path) => `${host}${path}`),
        `${host}?x=1`,
        `${host}#x`,
        `user:pass@${host}`,
        `http://${host}`,
        `${host} x`,
        `${host}/`,
      ];
    };

    it('refuses a value with more than a host and a port, and sends nothing', async () => {
      for (const value of invalidHosts()) {
        vi.stubEnv('GCE_METADATA_HOST', value);
        stdout = '';
        stderr = '';

        expect(
          await run(['ci', 'auth', 'status', '--oidc-provider', 'google-cloud'])
        ).toBe(0);
        expect(stdout).toContain(
          'Google Cloud OIDC: GCE_METADATA_HOST must be a host name or IP address'
        );

        expect(
          await run([
            'ci',
            'auth',
            'get-oidc-token',
            '--for',
            'api',
            '--oidc-provider',
            'google-cloud',
          ])
        ).toBe(1);
        expect(stderr).toContain('GCE_METADATA_HOST must be a host name');
        expect(stdout).not.toContain(GOOGLE_TOKEN);
      }
      expect(server.requests).toEqual([]);
    });

    it('accepts a host with a port, an IPv4 address and an IPv6 address', async () => {
      const { port } = new URL(server.url);
      for (const host of [`localhost:${port}`, `127.0.0.1:${port}`]) {
        vi.stubEnv('GCE_METADATA_HOST', host);
        expect(
          await requestGoogleMetadata('instance/service-accounts/default/email')
        ).toBe(SA_EMAIL);
      }
      vi.stubEnv('GCE_METADATA_HOST', `[::1]:${closedHost.split(':').pop()}`);
      await expect(
        requestGoogleMetadata('instance/service-accounts/default/email')
      ).rejects.toThrow('is unreachable');
    });
  });

  describe('which source wins', () => {
    it('does not fall back to GitHub when the metadata server is unreachable', async () => {
      setGitHubEnv();
      vi.stubEnv('GCE_METADATA_HOST', closedHost);

      expect(
        await run([
          'ci',
          'auth',
          'get-api-token',
          '--oidc-provider',
          'google-cloud',
        ])
      ).toBe(1);
      expect(
        await run(['cache', 'set', '--oidc-provider', 'google-cloud'])
      ).toBe(1);

      expect(server.requests).toEqual([]);
    });

    it('uses a configured key before the provider', async () => {
      vi.stubEnv('CURRENTS_REST_API_URL', server.url);

      await run([
        'cache',
        'set',
        '--key',
        'dashboard-key',
        '--oidc-provider',
        'google-cloud',
      ]);
      expect(getCacheCommandConfig().values?.recordKey).toBe('dashboard-key');

      vi.stubEnv('CURRENTS_API_KEY', 'dashboard-api-key');
      await run(['api', '/v1/runs/r1', '--oidc-provider', 'google-cloud']);

      expect(requestsTo(IDENTITY_PATH)).toEqual([]);
      expect(requestsTo('/oidc/token')).toEqual([]);
      expect(requestsTo('/oidc/api/token')).toEqual([]);
      expect(requestsTo('/v1/runs/r1')[0].headers.authorization).toBe(
        'Bearer dashboard-api-key'
      );
    });

    it('uses CURRENTS_OIDC_API_TOKEN before the provider in the api command', async () => {
      vi.stubEnv('CURRENTS_OIDC_API_TOKEN', 'job-api-token');
      vi.stubEnv('CURRENTS_REST_API_URL', server.url);

      await run(['api', '/v1/runs/r1', '--oidc-provider', 'google-cloud']);

      expect(requestsTo(IDENTITY_PATH)).toEqual([]);
      expect(subjectToken('/oidc/api/token')).toBe('job-api-token');
    });

    it('ci auth get-api-token gets the token from the provider, not from the variables', async () => {
      vi.stubEnv('CURRENTS_OIDC_API_TOKEN', 'job-api-token');
      vi.stubEnv('CURRENTS_OIDC_TOKEN', 'job-token');

      await run([
        'ci',
        'auth',
        'get-api-token',
        '--oidc-provider',
        'google-cloud',
      ]);

      expect(subjectToken('/oidc/api/token')).toBe(GOOGLE_TOKEN);
    });

    it('takes the flag over CURRENTS_OIDC_PROVIDER', async () => {
      setGitHubEnv();
      vi.stubEnv('CURRENTS_OIDC_PROVIDER', 'github-actions');

      await run([
        'ci',
        'auth',
        'get-api-token',
        '--oidc-provider',
        'google-cloud',
      ]);

      expect(requestsTo('/github-token')).toEqual([]);
      expect(subjectToken('/oidc/api/token')).toBe(GOOGLE_TOKEN);
    });

    it('takes the GitHub flag over CURRENTS_OIDC_PROVIDER=google-cloud', async () => {
      setGitHubEnv();
      vi.stubEnv('CURRENTS_OIDC_PROVIDER', 'google-cloud');

      await run([
        'ci',
        'auth',
        'get-api-token',
        '--oidc-provider',
        'github-actions',
      ]);

      expect(requestsTo(IDENTITY_PATH)).toEqual([]);
      expect(subjectToken('/oidc/api/token')).toBe(GITHUB_TOKEN);
    });
  });

  it('prints the Google Cloud token with get-oidc-token outside a known CI', async () => {
    expect(
      await run([
        'ci',
        'auth',
        'get-oidc-token',
        '--for',
        'record',
        '--oidc-provider',
        'google-cloud',
      ])
    ).toBe(0);

    expect(stdout).toBe(`${GOOGLE_TOKEN}\n`);
    const url = new URL(requestsTo(IDENTITY_PATH)[0].url, server.url);
    expect(url.searchParams.get('audience')).toBe('currents:record-key');
  });

  it('stops waiting for a metadata server that does not answer', async () => {
    googleMetadataRequest.attempts = 2;
    googleMetadataRequest.timeoutMs = 50;
    responses[IDENTITY_PATH] = [{ hang: true }, { hang: true }];

    await expect(
      findTokenSource('google-cloud')!.getToken(process.env, 'currents:api')
    ).rejects.toThrow('is unreachable');
    expect(requestsTo(IDENTITY_PATH)).toHaveLength(2);
  });

  it('keeps the token out of the debug log and of an exchange error', async () => {
    responses['/oidc/api/token'] = [
      {
        status: 400,
        json: {
          error: 'invalid_grant',
          error_description: `bad ${GOOGLE_TOKEN}`,
        },
      },
    ];

    expect(
      await run([
        'ci',
        'auth',
        'get-api-token',
        '--oidc-provider',
        'google-cloud',
        '--debug',
      ])
    ).toBe(1);

    expect(stderr).toContain('Could not exchange the Google Cloud OIDC token');
    expect(stdout + stderr).not.toContain(GOOGLE_TOKEN);
  });

  it('does not print an answer to the email request that is not an email', async () => {
    vi.stubEnv('CURRENTS_OIDC_PROVIDER', 'google-cloud');
    responses[EMAIL_PATH] = [{ status: 200, body: 'eyJ.secret-looking.body' }];

    await run(['ci', 'auth', 'status']);

    expect(stdout).toContain('answers; service account not named');
    expect(stdout).not.toContain('secret-looking');
  });

  it('does not print the body of a refused email request', async () => {
    vi.stubEnv('CURRENTS_OIDC_PROVIDER', 'google-cloud');
    responses[EMAIL_PATH] = [{ status: 403, body: 'secret-looking body' }];

    await run(['ci', 'auth', 'status']);

    expect(stdout).toContain('answered 403 for the service account email');
    expect(stdout).not.toContain('secret-looking');
  });

  describe('a refused identity request', () => {
    const BODY = 'eyJ.sensitive-metadata-body.signature';

    it.each(
      [302, 400, 403, 404, 429, 500, 503].flatMap((status) => [
        [status, 'get-oidc-token', false],
        [status, 'get-oidc-token', true],
        [status, 'get-api-token', false],
        [status, 'get-api-token', true],
      ]) as [number, string, boolean][]
    )(
      'prints the status but not the body: %d, %s, debug %s',
      async (status, command, withDebug) => {
        responses[IDENTITY_PATH] = Array(3).fill({
          status,
          body: BODY,
          headers: status === 302 ? { location: `${server.url}/x` } : {},
        });

        expect(
          await run([
            'ci',
            'auth',
            command,
            ...(command === 'get-oidc-token' ? ['--for', 'api'] : []),
            '--oidc-provider',
            'google-cloud',
            ...(withDebug ? ['--debug'] : []),
          ])
        ).toBe(1);

        expect(stderr).toContain(`answered ${status}`);
        expect(stdout + stderr).not.toContain('sensitive-metadata-body');
      }
    );
  });

  describe('providers with a token command', () => {
    const CLI_TOKEN = 'cli-id-token';
    const SECRET_OUTPUT = 'secret-output-of-the-command';
    let binDir: string;
    let argsFile: string;

    // Writes its arguments, one per line, then prints the token or fails.
    const fakeCommand = `#!/bin/sh
printf '%s\\n' "$@" > "$FAKE_ARGS_FILE"
if [ "$FAKE_SLEEP" ]; then
  echo "${SECRET_OUTPUT}"
  exec /bin/sleep "$FAKE_SLEEP"
fi
if [ "$FAKE_EXIT" ]; then
  echo "${SECRET_OUTPUT}"
  echo "${SECRET_OUTPUT}" >&2
  exit "$FAKE_EXIT"
fi
echo "${CLI_TOKEN}"
`;

    beforeAll(async () => {
      binDir = await mkdtemp(join(tmpdir(), 'currents-oidc-'));
      argsFile = join(binDir, 'args');
      for (const name of ['circleci', 'buildkite-agent']) {
        await writeFile(join(binDir, name), fakeCommand);
        await chmod(join(binDir, name), 0o755);
      }
    });

    afterAll(() => rm(binDir, { recursive: true, force: true }));

    beforeEach(() => {
      // The commands use only the builtins of sh.
      vi.stubEnv('PATH', binDir);
      vi.stubEnv('FAKE_ARGS_FILE', argsFile);
      vi.stubEnv('FAKE_EXIT', undefined);
      vi.stubEnv('FAKE_SLEEP', undefined);
    });

    afterEach(() => {
      tokenCommand.timeoutMs = 30_000;
    });

    const commandArgs = async () =>
      (await readFile(argsFile, 'utf8')).trimEnd().split('\n');

    it('runs circleci with the audience as a claim', async () => {
      expect(
        await run([
          'ci',
          'auth',
          'get-oidc-token',
          '--oidc-provider',
          'circleci',
          '--for',
          'api',
        ])
      ).toBe(0);

      expect(stdout).toBe(`${CLI_TOKEN}\n`);
      expect(await commandArgs()).toEqual([
        'run',
        'oidc',
        'get',
        '--claims',
        '{"aud":"currents:api"}',
      ]);
    });

    it('runs buildkite-agent with --audience, and exchanges its token', async () => {
      expect(
        await run([
          'ci',
          'auth',
          'get-record-key',
          '--oidc-provider',
          'buildkite',
          '--audience',
          'staging:record-key',
        ])
      ).toBe(0);

      expect(await commandArgs()).toEqual([
        'oidc',
        'request-token',
        '--audience',
        'staging:record-key',
      ]);
      expect(subjectToken('/oidc/token')).toBe(CLI_TOKEN);
      expect(stdout).toBe('crnts_ci_t\n');
    });

    it('takes the provider from CURRENTS_OIDC_PROVIDER', async () => {
      vi.stubEnv('CURRENTS_OIDC_PROVIDER', 'circleci');

      await run(['ci', 'auth', 'get-oidc-token', '--for', 'record']);

      expect(await commandArgs()).toContain('{"aud":"currents:record-key"}');
      expect(stdout).toBe(`${CLI_TOKEN}\n`);
    });

    it.each(['circleci', 'buildkite'])(
      'names the executable and the exit status of a failed %s command, not its output',
      async (provider) => {
        vi.stubEnv('FAKE_EXIT', '3');

        expect(
          await run([
            'ci',
            'auth',
            'get-oidc-token',
            '--oidc-provider',
            provider,
            '--for',
            'api',
            '--debug',
          ])
        ).toBe(1);

        const file = provider === 'circleci' ? 'circleci' : 'buildkite-agent';
        expect(stderr).toContain(`${file} exited with status 3`);
        expect(stdout + stderr).not.toContain(SECRET_OUTPUT);
        expect(stdout).toBe('');
      }
    );

    it('stops a command that does not answer within the timeout', async () => {
      tokenCommand.timeoutMs = 200;
      vi.stubEnv('FAKE_SLEEP', '10');
      const start = Date.now();

      expect(
        await run([
          'ci',
          'auth',
          'get-oidc-token',
          '--oidc-provider',
          'circleci',
          '--for',
          'api',
        ])
      ).toBe(1);

      expect(Date.now() - start).toBeLessThan(5000);
      expect(stderr).toContain(
        'Could not get the CircleCI OIDC token: circleci did not answer within 0.2 seconds'
      );
      expect(stdout + stderr).not.toContain(SECRET_OUTPUT);
    });

    it('says when the executable is not on the PATH', async () => {
      vi.stubEnv('PATH', join(binDir, 'missing'));

      expect(
        await run([
          'ci',
          'auth',
          'get-api-token',
          '--oidc-provider',
          'buildkite',
        ])
      ).toBe(1);

      expect(stderr).toContain(
        'Could not get the Buildkite OIDC token: buildkite-agent is not on the PATH'
      );
      expect(server.requests).toEqual([]);
    });

    it('refuses a provider it does not know', async () => {
      expect(
        await run([
          'ci',
          'auth',
          'get-oidc-token',
          '--oidc-provider',
          'gitlab',
          '--for',
          'api',
        ])
      ).toBe(1);

      expect(stderr).toContain(
        'Allowed choices are github-actions, google-cloud, circleci, buildkite'
      );
      expect(stderr).not.toContain('gitlab');
    });
  });
});
