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
import { getCurrentsConfig } from '../../config/upload';
import { handleSetCache } from '../../services';
import { handleSessionStart } from '../../services/session';
import { getOidcAudience } from '../../http/httpConfig';
import { findTokenSource, resetOidcExchange } from '../../lib/oidc';
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

const formBody = (request: RecordedRequest) =>
  new URLSearchParams(request.body.toString());

vi.mock('../../services', () => ({
  handleCurrentsReport: vi.fn(),
  handleGetCache: vi.fn(),
  handleSetCache: vi.fn(),
  handleCancelRun: vi.fn(),
  handleGetRun: vi.fn(),
}));
vi.mock('../../services/session', () => ({
  handleRunAttach: vi.fn(),
  handleSessionAttach: vi.fn(),
  handleSessionShare: vi.fn(),
  handleSessionStart: vi.fn(),
}));

class ExitError extends Error {
  constructor(public code: number | undefined) {
    super(`exit ${code}`);
  }
}

const GITHUB_TOKEN = 'github-id-token';
const REQUEST_TOKEN = 'actions-request-token';
const EXPIRES_IN = 21600;

describe('record key from an OIDC token', () => {
  let server: ApiServer;
  let oidcResponse: Response;
  let revokeResponse: Response;
  // Requests answered with 503 before the real answer.
  let githubFailures: number;
  let oidcFailures: number;
  let stderr: string;
  let consoleErrors: string;

  const oidcRequests = () =>
    server.requests.filter((r) => r.url.startsWith('/oidc/token'));
  const revokeRequests = () =>
    server.requests.filter((r) => r.url === '/oidc/revoke');
  const githubRequests = () =>
    server.requests.filter((r) => r.url.startsWith('/github-token'));

  beforeAll(async () => {
    server = await startApiServer((request: RecordedRequest) => {
      if (request.url.startsWith('/github-token')) {
        if (githubFailures-- > 0) return { status: 503 };
        return { status: 200, json: { value: GITHUB_TOKEN } };
      }
      if (request.url === '/oidc/revoke') return revokeResponse;
      if (request.url === '/oidc/token') {
        return oidcFailures-- > 0 ? { status: 503 } : oidcResponse;
      }
      return { status: 404 };
    });
    // The HTTP client reads the base URL once, when it is first used.
    process.env.CURRENTS_API_URL = server.url;
  });

  afterAll(async () => {
    delete process.env.CURRENTS_API_URL;
    await server.close();
  });

  beforeEach(() => {
    server.requests.length = 0;
    vi.mocked(handleSetCache).mockReset();
    resetOidcExchange();
    githubFailures = 0;
    revokeResponse = { status: 200 };
    oidcFailures = 0;
    oidcResponse = {
      status: 200,
      json: {
        access_token: 'oidc-record-key',
        issued_token_type: 'urn:ietf:params:oauth:token-type:access_token',
        token_type: 'Bearer',
        expires_in: EXPIRES_IN,
      },
    };
    stderr = '';
    consoleErrors = '';
    for (const name of [
      'CURRENTS_RECORD_KEY',
      'CURRENTS_API_KEY',
      'CURRENTS_PROJECT_ID',
      'CURRENTS_DEBUG',
      'ACTIONS_ID_TOKEN_REQUEST_URL',
      'ACTIONS_ID_TOKEN_REQUEST_TOKEN',
      'CURRENTS_OIDC_TOKEN',
      'GITHUB_ACTIONS',
    ]) {
      vi.stubEnv(name, undefined);
    }
    vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
      stderr += String(chunk);
      return true;
    });
    vi.spyOn(console, 'log').mockReturnValue();
    vi.spyOn(console, 'error').mockImplementation((...args) => {
      consoleErrors += args.join(' ');
    });
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
    vi.stubEnv(
      'ACTIONS_ID_TOKEN_REQUEST_URL',
      `${server.url}/github-token?api-version=2.0`
    );
    vi.stubEnv('ACTIONS_ID_TOKEN_REQUEST_TOKEN', REQUEST_TOKEN);
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

  it('does not exchange a token when a key is configured', async () => {
    setGitHubEnv();

    await run(['cache', 'set', '--key', 'static-key']);

    expect(server.requests).toEqual([]);
    expect(getCacheCommandConfig().values?.recordKey).toBe('static-key');
  });

  it('does not exchange a token when CURRENTS_RECORD_KEY is set', async () => {
    setGitHubEnv();
    vi.stubEnv('CURRENTS_RECORD_KEY', 'env-key');
    vi.stubEnv('CURRENTS_PROJECT_ID', 'project');

    await run(['run', 'upload']);

    expect(server.requests).toEqual([]);
    expect(getCurrentsConfig()?.recordKey).toBe('env-key');
  });

  it('uses the exchanged key for run upload', async () => {
    setGitHubEnv();

    await run(['run', 'upload', '--project-id', 'project']);

    expect(getCurrentsConfig()?.recordKey).toBe('oidc-record-key');
  });

  it('uses the exchanged key for cache set and cache get', async () => {
    setGitHubEnv();

    await run(['cache', 'set']);
    expect(getCacheCommandConfig().values?.recordKey).toBe('oidc-record-key');

    resetOidcExchange();
    await run(['cache', 'get']);
    expect(getCacheCommandConfig().values?.recordKey).toBe('oidc-record-key');
  });

  it('asks GitHub for a token with the audience and the request token', async () => {
    setGitHubEnv();

    await run(['cache', 'set']);

    const [githubRequest] = githubRequests();
    const url = new URL(githubRequest.url, server.url);
    expect(url.searchParams.get('audience')).toBe(new URL(server.url).origin);
    expect(url.searchParams.get('api-version')).toBe('2.0');
    expect(githubRequest.headers.authorization).toBe(`bearer ${REQUEST_TOKEN}`);
  });

  it('sends the GitHub token to the Currents API as a token exchange', async () => {
    setGitHubEnv();

    await run(['cache', 'set']);

    expect(oidcRequests()).toHaveLength(1);
    expect(oidcRequests()[0].method).toBe('POST');
    expect(oidcRequests()[0].headers['content-type']).toBe(
      'application/x-www-form-urlencoded'
    );
    expect(Object.fromEntries(formBody(oidcRequests()[0]))).toEqual({
      grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
      subject_token: GITHUB_TOKEN,
      subject_token_type: 'urn:ietf:params:oauth:token-type:jwt',
    });
  });

  const secrets = ['oidc-record-key', GITHUB_TOKEN, REQUEST_TOKEN];

  it('logs the expiry and neither the key nor the tokens', async () => {
    setGitHubEnv();

    await run(['cache', 'set']);

    const expiresAt = stderr.match(
      /GitHub Actions OIDC token, valid until (\S+)/
    )?.[1];
    expect(new Date(expiresAt as string).getTime()).toBeCloseTo(
      Date.now() + EXPIRES_IN * 1000,
      -5
    );
    for (const secret of secrets) {
      expect(stderr + consoleErrors).not.toContain(secret);
    }
  });

  it('prints neither the key nor the tokens with --debug', async () => {
    setGitHubEnv();

    await run(['cache', 'set', '--debug']);

    // The debug log holds the exchange request and response.
    expect(stderr).toContain('oidc/token');
    expect(stderr).toContain('subject_token=*****');
    for (const secret of secrets) {
      expect(stderr + consoleErrors).not.toContain(secret);
    }
  });

  it('prints neither the tokens nor the GitHub URL when the exchange fails with --debug', async () => {
    setGitHubEnv();
    oidcResponse = {
      status: 403,
      json: { error: 'access_denied', error_description: 'rejected' },
    };

    await run(['cache', 'set', '--debug']);

    expect(stderr).toContain('oidc/token');
    for (const secret of [GITHUB_TOKEN, REQUEST_TOKEN, '/github-token']) {
      expect(stderr + consoleErrors).not.toContain(secret);
    }
  });

  it('retries the GitHub token request after a 503', async () => {
    setGitHubEnv();
    githubFailures = 1;

    await run(['cache', 'set']);

    expect(githubRequests()).toHaveLength(2);
    expect(getCacheCommandConfig().values?.recordKey).toBe('oidc-record-key');
  });

  it('retries the exchange after a 503', async () => {
    setGitHubEnv();
    oidcFailures = 1;

    await run(['cache', 'set']);

    expect(oidcRequests()).toHaveLength(2);
    expect(getCacheCommandConfig().values?.recordKey).toBe('oidc-record-key');
  });

  it('says how to get a key when there is no key and no GitHub OIDC', async () => {
    const code = await run(['cache', 'set']);

    expect(code).toBe(1);
    expect(consoleErrors).toContain('Record key is required');
    expect(consoleErrors).toContain('permissions: id-token: write');
    expect(consoleErrors).toContain('CURRENTS_OIDC_TOKEN');
    expect(server.requests).toEqual([]);
  });

  it('shows the hint with the cloud URL when CURRENTS_API_URL is not a valid URL', async () => {
    vi.stubEnv('CURRENTS_API_URL', 'not a url');

    const code = await run(['cache', 'set']);

    expect(code).toBe(1);
    expect(consoleErrors).toContain('Record key is required');
    expect(consoleErrors).toContain('`aud: https://cy.currents.dev`');
    expect(consoleErrors).toContain('CURRENTS_API_URL is not a valid URL.');
  });

  it('says how to get a key for session commands with no credentials', async () => {
    const code = await run(['session', 'start', '--title', 't', '-p', 'p']);

    expect(code).toBe(1);
    expect(consoleErrors).toContain('permissions: id-token: write');
  });

  it('stops with the message of the server when the exchange is rejected', async () => {
    setGitHubEnv();
    oidcResponse = {
      status: 403,
      json: {
        error: 'invalid_grant',
        error_description: 'No trust policy for repository acme/web',
        code: 'OIDC_NO_TRUST_POLICY',
      },
    };

    const code = await run(['cache', 'set']);

    expect(code).toBe(1);
    expect(consoleErrors).toContain('No trust policy for repository acme/web');
    expect(handleSetCache).not.toHaveBeenCalled();
  });

  it.each([
    [
      'error when there is no description',
      { error: 'invalid_grant' },
      'for a record key: invalid_grant',
    ],
    [
      'HTTP error when there is neither',
      { message: 'ignored' },
      'for a record key: Request failed with status code 403',
    ],
  ])('shows the %s', async (_name, json, expected) => {
    setGitHubEnv();
    oidcResponse = { status: 403, json };

    const code = await run(['cache', 'set']);

    expect(code).toBe(1);
    expect(consoleErrors).toContain(expected);
  });

  it('stops when the response has no access token', async () => {
    setGitHubEnv();
    oidcResponse = { status: 200, json: { token_type: 'Bearer' } };

    const code = await run(['cache', 'set']);

    expect(code).toBe(1);
    expect(consoleErrors).toContain('the response has no access token');
  });

  it('stops when GitHub does not give a token', async () => {
    vi.stubEnv('ACTIONS_ID_TOKEN_REQUEST_URL', `${server.url}/missing`);
    vi.stubEnv('ACTIONS_ID_TOKEN_REQUEST_TOKEN', REQUEST_TOKEN);

    const code = await run(['cache', 'set']);

    expect(code).toBe(1);
    expect(consoleErrors).toContain(
      'Could not get the GitHub Actions OIDC token'
    );
    expect(oidcRequests()).toEqual([]);
  });

  it('does not exchange a token for a session command with an API key', async () => {
    setGitHubEnv();

    await run([
      'session',
      'start',
      '--title',
      't',
      '-p',
      'p',
      '--api-key',
      'a',
    ]);

    expect(server.requests).toEqual([]);
  });

  it('does not exchange a token for commands that take only an API key', async () => {
    setGitHubEnv();

    await run([
      'run',
      'get',
      '--api-key',
      'a',
      '-p',
      'p',
      '--ci-build-id',
      'b',
    ]);

    expect(server.requests).toEqual([]);
  });

  describe('session start --json', () => {
    it('writes the retry warnings of the exchange to stderr', async () => {
      setGitHubEnv();
      githubFailures = 1;
      const log = console.log as unknown as {
        mock: { calls: unknown[][] };
      };

      await run(['session', 'start', '--title', 't', '-p', 'p', '--json']);

      expect(githubRequests()).toHaveLength(2);
      expect(consoleErrors).toContain('Next attempt is in');
      expect(log.mock.calls.flat().join(' ')).not.toContain('Next attempt');
    });

    it('leaves the warnings on stdout without --json', async () => {
      setGitHubEnv();
      githubFailures = 1;
      const log = console.log as unknown as {
        mock: { calls: unknown[][] };
      };

      await run(['session', 'start', '--title', 't', '-p', 'p']);

      expect(log.mock.calls.flat().join(' ')).toContain('Next attempt is in');
    });
  });

  describe('masking the key in GitHub Actions logs', () => {
    it('asks the runner to mask the issued key, once, before the key line', async () => {
      setGitHubEnv();
      vi.stubEnv('GITHUB_ACTIONS', 'true');

      await run(['cache', 'set']);

      const mask = '::add-mask::oidc-record-key\n';
      expect(stderr.split(mask)).toHaveLength(2);
      expect(stderr.indexOf(mask)).toBeLessThan(
        stderr.indexOf('Using a record key')
      );
    });

    it('prints the key nowhere else with --debug', async () => {
      setGitHubEnv();
      vi.stubEnv('GITHUB_ACTIONS', 'true');

      await run(['cache', 'set', '--debug']);

      const rest = stderr.replace('::add-mask::oidc-record-key\n', '');
      expect(rest + consoleErrors).not.toContain('oidc-record-key');
    });

    it('does not mask outside GitHub Actions', async () => {
      vi.stubEnv('CURRENTS_OIDC_TOKEN', 'own-token');

      await run(['cache', 'set']);

      expect(stderr).not.toContain('::add-mask::');
    });

    it('does not mask a key that was not issued by the exchange', async () => {
      setGitHubEnv();
      vi.stubEnv('GITHUB_ACTIONS', 'true');

      await run(['cache', 'set', '--key', 'static-key']);

      expect(stderr).not.toContain('::add-mask::');
    });
  });

  describe('revoking the key', () => {
    it.each([
      ['run upload', ['run', 'upload', '--project-id', 'project']],
      ['cache set', ['cache', 'set']],
    ])('after %s, with the issued key', async (_name, args) => {
      setGitHubEnv();

      const code = await run(args);

      expect(code).toBe(0);
      expect(revokeRequests()).toHaveLength(1);
      const [revoke] = revokeRequests();
      expect(revoke.method).toBe('POST');
      expect(revoke.headers['content-type']).toBe(
        'application/x-www-form-urlencoded'
      );
      expect(Object.fromEntries(formBody(revoke))).toEqual({
        token: 'oidc-record-key',
        token_type_hint: 'access_token',
      });
      const urls = server.requests.map((r) => r.url);
      expect(urls.indexOf('/oidc/revoke')).toBeGreaterThan(
        urls.findIndex((url) => url.startsWith('/oidc/token'))
      );
    });

    it('also when the command fails', async () => {
      setGitHubEnv();
      vi.mocked(handleSetCache).mockRejectedValueOnce(new Error('boom'));

      const code = await run(['cache', 'set']);

      expect(code).toBe(1);
      expect(consoleErrors).toContain('boom');
      expect(revokeRequests()).toHaveLength(1);
    });

    it('not for a key from --key or CURRENTS_RECORD_KEY', async () => {
      setGitHubEnv();

      await run(['cache', 'set', '--key', 'static-key']);
      vi.stubEnv('CURRENTS_RECORD_KEY', 'env-key');
      await run(['cache', 'set']);

      expect(server.requests).toEqual([]);
    });

    it.each([
      ['a dropped connection', { destroy: true } as Response],
      ['a 500', { status: 500 } as Response],
    ])('does not change the exit code after %s', async (_name, response) => {
      setGitHubEnv();
      revokeResponse = response;

      const code = await run(['cache', 'set']);

      expect(code).toBe(0);
      expect(revokeRequests()).toHaveLength(1);
    });

    it('keeps the exit code of a failed command after a failed revoke', async () => {
      setGitHubEnv();
      revokeResponse = { status: 500 };
      vi.mocked(handleSetCache).mockRejectedValueOnce(new Error('boom'));

      expect(await run(['cache', 'set'])).toBe(1);
    });

    it('prints token=***** and never the key with --debug', async () => {
      setGitHubEnv();

      await run(['cache', 'set', '--debug']);

      expect(revokeRequests()).toHaveLength(1);
      expect(stderr).toContain('oidc/revoke');
      expect(stderr).toContain('token=*****');
      expect(stderr + consoleErrors).not.toContain('oidc-record-key');
    });

    it('says in the debug log when the revoke fails, without the key', async () => {
      setGitHubEnv();
      revokeResponse = { status: 500 };

      await run(['cache', 'set', '--debug']);

      expect(stderr).toContain('Could not revoke the record key from OIDC');
      expect(stderr + consoleErrors).not.toContain('oidc-record-key');
    });
  });

  describe('audience', () => {
    it.each([
      ['https://cy.currents.dev', 'https://cy.currents.dev'],
      ['https://cy.currents.dev/', 'https://cy.currents.dev'],
      ['https://cy.currents.dev/v1/runs?a=1', 'https://cy.currents.dev'],
      ['HTTPS://CY.Currents.DEV', 'https://cy.currents.dev'],
      ['https://cy.currents.dev:443', 'https://cy.currents.dev'],
      ['http://currents.example.com:80/', 'http://currents.example.com'],
      [
        'https://currents.example.com:8443/api/',
        'https://currents.example.com:8443',
      ],
      ['http://localhost:1234', 'http://localhost:1234'],
    ])('is the origin of %s', (url, expected) => {
      expect(getOidcAudience(url)).toBe(expected);
    });

    it('is the origin of CURRENTS_API_URL, https://cy.currents.dev by default', () => {
      vi.stubEnv('CURRENTS_API_URL', 'https://Currents.example.com:8443/');
      expect(getOidcAudience()).toBe('https://currents.example.com:8443');

      vi.stubEnv('CURRENTS_API_URL', undefined);
      expect(getOidcAudience()).toBe('https://cy.currents.dev');
    });

    it('is requested from GitHub for the default and a custom API URL', async () => {
      setGitHubEnv();
      const requestedAudience = async () => {
        await findTokenSource(process.env)?.getToken(process.env);
        const [last] = githubRequests().slice(-1);
        return new URL(last.url, server.url).searchParams.get('audience');
      };

      vi.stubEnv('CURRENTS_API_URL', undefined);
      expect(await requestedAudience()).toBe('https://cy.currents.dev');

      vi.stubEnv('CURRENTS_API_URL', 'https://Currents.example.com:8443/api/');
      expect(await requestedAudience()).toBe(
        'https://currents.example.com:8443'
      );
      expect(githubRequests()).toHaveLength(2);
    });
  });

  describe('token sources', () => {
    const sentTokens = () =>
      oidcRequests().map((r) => formBody(r).get('subject_token'));

    describe.each([
      ['CURRENTS_OIDC_TOKEN', 'token in --oidc-token or CURRENTS_OIDC_TOKEN'],
    ])('%s', (variable, name) => {
      it('is exchanged and its provider is logged', async () => {
        vi.stubEnv(variable, ' provider-token \n');

        await run(['cache', 'set']);

        expect(sentTokens()).toEqual(['provider-token']);
        expect(getCacheCommandConfig().values?.recordKey).toBe(
          'oidc-record-key'
        );
        expect(stderr).toContain(`from the ${name}, valid until`);
        expect(stderr + consoleErrors).not.toContain('provider-token');
      });

      it('is skipped when it is absent', async () => {
        await run(['cache', 'set']);

        expect(server.requests).toEqual([]);
      });

      it('is skipped when a key is configured', async () => {
        vi.stubEnv(variable, 'provider-token');

        await run(['cache', 'set', '--key', 'static-key']);

        expect(server.requests).toEqual([]);
      });

      it('is skipped for a command with an API key', async () => {
        vi.stubEnv(variable, 'provider-token');

        await run([
          'run',
          'get',
          '--api-key',
          'a',
          '-p',
          'p',
          '--ci-build-id',
          'b',
        ]);
        await run([
          'session',
          'start',
          '--title',
          't',
          '-p',
          'p',
          '--api-key',
          'a',
        ]);

        expect(server.requests).toEqual([]);
      });

      it('is not printed with --debug', async () => {
        vi.stubEnv(variable, 'provider-token');

        await run(['cache', 'set', '--debug']);

        expect(stderr).toContain('oidc/token');
        expect(stderr + consoleErrors).not.toContain('provider-token');
        expect(stderr + consoleErrors).not.toContain('oidc-record-key');
      });
    });

    describe('--oidc-token', () => {
      it('is exchanged and its provider is logged', async () => {
        await run(['cache', 'set', '--oidc-token', ' cli-token ']);

        expect(sentTokens()).toEqual(['cli-token']);
        expect(getCacheCommandConfig().values?.recordKey).toBe(
          'oidc-record-key'
        );
        expect(stderr).toContain(
          'from the token in --oidc-token or CURRENTS_OIDC_TOKEN, valid until'
        );
      });

      it.each([
        ['run upload', ['run', 'upload', '-p', 'p']],
        ['run cancel', ['run', 'cancel', '-p', 'p', '--run-id', 'r']],
        ['cache get', ['cache', 'get']],
        ['run attach', ['run', 'attach', 'a.png', '-p', 'p']],
        ['session start', ['session', 'start', '--title', 't', '-p', 'p']],
        ['session attach', ['session', 'attach', 'a.png']],
        ['session share', ['session', 'share']],
      ])('is accepted by %s', async (_name, args) => {
        await run([...args, '--oidc-token', 'cli-token']);

        expect(sentTokens()).toEqual(['cli-token']);
      });

      it('loses to --key', async () => {
        await run(['cache', 'set', '--key', 'static-key', '--oidc-token', 't']);

        expect(server.requests).toEqual([]);
        expect(getCacheCommandConfig().values?.recordKey).toBe('static-key');
      });

      it('loses to CURRENTS_RECORD_KEY', async () => {
        vi.stubEnv('CURRENTS_RECORD_KEY', 'env-key');

        await run(['cache', 'set', '--oidc-token', 't']);

        expect(server.requests).toEqual([]);
        expect(getCacheCommandConfig().values?.recordKey).toBe('env-key');
      });

      it('wins over CURRENTS_OIDC_TOKEN and GitHub Actions', async () => {
        setGitHubEnv();
        vi.stubEnv('CURRENTS_OIDC_TOKEN', 'env-token');

        await run(['cache', 'set', '--oidc-token', 'cli-token']);

        expect(sentTokens()).toEqual(['cli-token']);
        expect(githubRequests()).toEqual([]);
      });

      it('is skipped for a command with an API key', async () => {
        await run([
          'session',
          'start',
          '--title',
          't',
          '-p',
          'p',
          '--api-key',
          'a',
          '--oidc-token',
          'cli-token',
        ]);

        expect(server.requests).toEqual([]);
      });

      it.each([
        ['an empty --oidc-token', ['--oidc-token', '']],
        ['a blank --oidc-token', ['--oidc-token', '  ']],
      ])('is unset with %s', async (_name, flags) => {
        setGitHubEnv();

        await run(['cache', 'set', ...flags]);

        expect(sentTokens()).toEqual([GITHUB_TOKEN]);
      });

      it('is unset with an empty CURRENTS_OIDC_TOKEN', async () => {
        vi.stubEnv('CURRENTS_OIDC_TOKEN', '');
        setGitHubEnv();

        await run(['cache', 'set']);

        expect(sentTokens()).toEqual([GITHUB_TOKEN]);
      });

      it('with nothing else gives the missing-key error', async () => {
        const code = await run(['cache', 'set', '--oidc-token', '']);

        expect(code).toBe(1);
        expect(consoleErrors).toContain('Record key is required');
        expect(consoleErrors).toContain('--oidc-token or CURRENTS_OIDC_TOKEN');
      });

      it('is not printed with --debug, nor in the config dump', async () => {
        await run(['cache', 'set', '--debug', '--oidc-token', 'cli-token']);
        await run([
          'session',
          'start',
          '--title',
          't',
          '-p',
          'p',
          '--debug',
          '--oidc-token',
          'cli-token',
        ]);
        await run([
          'session',
          'start',
          '--title',
          't',
          '-p',
          'p',
          '--debug',
          '--key',
          'static-key',
          '--oidc-token',
          'cli-token',
        ]);

        expect(stderr).toContain('oidc/token');
        expect(stderr).toContain('Resolved config');
        expect(stderr + consoleErrors).not.toContain('cli-token');
        expect(stderr + consoleErrors).not.toContain('oidc-record-key');
      });

      it('is not kept in the config of the command', async () => {
        await run([
          'session',
          'start',
          '--title',
          't',
          '-p',
          'p',
          '--oidc-token',
          'cli-token',
        ]);

        const [config] = vi.mocked(handleSessionStart).mock.lastCall as [
          object,
        ];
        expect(JSON.stringify(config)).not.toContain('cli-token');
        expect(config).not.toHaveProperty('oidcToken');
      });
    });

    it('prefers CURRENTS_OIDC_TOKEN to GitHub Actions', async () => {
      setGitHubEnv();
      vi.stubEnv('CURRENTS_OIDC_TOKEN', 'own-token');

      await run(['cache', 'set']);

      expect(sentTokens()).toEqual(['own-token']);
      expect(githubRequests()).toEqual([]);
    });

    it('reports the OIDC error of the first source only', async () => {
      setGitHubEnv();
      vi.stubEnv('CURRENTS_OIDC_TOKEN', 'own-token');
      oidcResponse = {
        status: 403,
        json: { error: 'invalid_grant', error_description: 'unknown issuer' },
      };

      const code = await run(['cache', 'set']);

      expect(code).toBe(1);
      expect(consoleErrors).toContain(
        'Could not exchange the token in --oidc-token or CURRENTS_OIDC_TOKEN for a record key: unknown issuer'
      );
      expect(sentTokens()).toEqual(['own-token']);
    });
  });
});
