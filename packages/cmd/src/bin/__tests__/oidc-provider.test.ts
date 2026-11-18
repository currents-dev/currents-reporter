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
  googleMetadataRetry,
  requestGoogleMetadata,
  resetOidcExchange,
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
    googleMetadataRetry.attempts = 3;
    googleMetadataRetry.delayMs = 1;
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
      const token = await findTokenSource('google')!.getToken(
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

      const token = await findTokenSource('google')!.getToken(
        process.env,
        'currents:api'
      );

      expect(token).toBe(GOOGLE_TOKEN);
      expect(requestsTo(IDENTITY_PATH)).toHaveLength(3);
    });

    it('says the metadata server is unreachable after the last attempt', async () => {
      vi.stubEnv('GCE_METADATA_HOST', closedHost);

      await expect(
        findTokenSource('google')!.getToken(process.env, 'currents:api')
      ).rejects.toThrow(
        `the Google Cloud metadata server at ${closedHost} is unreachable`
      );
    });

    it('repeats the refusal of the metadata server without trying again', async () => {
      responses[IDENTITY_PATH] = [
        { status: 404, body: 'service account not found' },
      ];

      await expect(
        findTokenSource('google')!.getToken(process.env, 'currents:api')
      ).rejects.toThrow('answered 404: service account not found');
      expect(requestsTo(IDENTITY_PATH)).toHaveLength(1);
    });

    it('does not follow a redirect', async () => {
      responses[IDENTITY_PATH] = [
        { status: 302, headers: { location: `${server.url}/elsewhere` } },
      ];

      await expect(
        findTokenSource('google')!.getToken(process.env, 'currents:api')
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
      await run(['ci', 'auth', 'get-api-token', '--oidc-provider', 'google'])
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
    vi.stubEnv('CURRENTS_OIDC_PROVIDER', 'google');
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

    await run(['api', '/v1/runs/r1', '--oidc-provider', 'google']);

    const url = new URL(requestsTo(IDENTITY_PATH)[0].url, server.url);
    expect(url.searchParams.get('audience')).toBe('staging:api');
  });

  it('uses a token in CURRENTS_OIDC_TOKEN before the provider', async () => {
    vi.stubEnv('CURRENTS_OIDC_TOKEN', 'job-token');

    await run(['cache', 'set', '--oidc-provider', 'google']);

    expect(requestsTo(IDENTITY_PATH)).toEqual([]);
    expect(subjectToken('/oidc/token')).toBe('job-token');
  });

  it('fails with a clear message when the metadata server is unreachable', async () => {
    vi.stubEnv('GCE_METADATA_HOST', closedHost);

    expect(
      await run(['ci', 'auth', 'get-api-token', '--oidc-provider', 'google'])
    ).toBe(1);

    expect(stderr).toContain(
      `Could not get the Google Cloud OIDC token: the Google Cloud metadata server at ${closedHost} is unreachable`
    );
    expect(stderr).toContain('Workload Identity');
    expect(requestsTo('/oidc/api/token')).toEqual([]);
  });

  it('fails when the GitHub provider is selected outside a job with id-token: write', async () => {
    expect(await run(['cache', 'set', '--oidc-provider', 'github'])).toBe(1);

    expect(stderr).toContain(
      'The OIDC provider is github (--oidc-provider or CURRENTS_OIDC_PROVIDER), but the GitHub Actions OIDC token is not available'
    );
    expect(server.requests).toEqual([]);
  });

  it('refuses a provider it does not know', async () => {
    vi.stubEnv('CURRENTS_OIDC_PROVIDER', 'aws');

    expect(await run(['cache', 'set'])).toBe(1);

    expect(stderr).toContain('Allowed choices are github, google');
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

    it('still finds GitHub Actions by itself', async () => {
      setGitHubEnv();

      await run(['ci', 'auth', 'get-api-token']);

      expect(requestsTo(IDENTITY_PATH)).toEqual([]);
      expect(subjectToken('/oidc/api/token')).toBe(GITHUB_TOKEN);
    });
  });

  describe('ci auth status', () => {
    it('reports the provider and the service account of the metadata server', async () => {
      vi.stubEnv('CURRENTS_OIDC_PROVIDER', 'google');

      expect(await run(['ci', 'auth', 'status'])).toBe(0);

      expect(stdout).toContain(
        'OIDC provider: google (CURRENTS_OIDC_PROVIDER)'
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
        await run(['ci', 'auth', 'status', '--oidc-provider', 'google'])
      ).toBe(0);

      expect(stdout).toContain('OIDC provider: google (--oidc-provider)');
      expect(stdout).toContain(
        `Google Cloud OIDC: the Google Cloud metadata server at ${closedHost} is unreachable`
      );
      expect(stdout).toContain('Workload Identity');
    });
  });
});
