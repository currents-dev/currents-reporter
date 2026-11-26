import fs from 'fs-extra';
import os from 'os';
import path from 'path';
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
import { getProgram } from '../../../bin/program';
import { resolveApiKey } from '../../../commands/api/request';
import { ApiServer, startApiServer } from '../../../test-utils/api-server';
import { getLoginCredentials, handleLogout, handleWhoami } from '..';
import {
  deleteCredentials,
  getCredentialsPath,
  OAuthCredentials,
  readCredentials,
  writeCredentials,
} from '../credentials';

vi.mock('../../../http/httpRetry', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../http/httpRetry')>()),
  getMaxRetries: () => 0,
}));

class ExitError extends Error {
  constructor(public code: number | undefined) {
    super(`exit ${code}`);
  }
}

let server: ApiServer;
let configDir: string;
let tokenStatus: number;

beforeAll(async () => {
  server = await startApiServer((request) => {
    if (request.url === '/.well-known/oauth-authorization-server') {
      return {
        status: 200,
        json: {
          issuer: server.url,
          authorization_endpoint: `${server.url}/authorize`,
          token_endpoint: `${server.url}/token`,
          revocation_endpoint: `${server.url}/revoke`,
        },
      };
    }
    if (request.url === '/.well-known/oauth-protected-resource') {
      return { status: 200, json: { resource: server.url } };
    }
    if (request.url === '/token') {
      return tokenStatus === 200
        ? {
            status: 200,
            json: { access_token: 'new-at', refresh_token: 'new-rt' },
          }
        : { status: tokenStatus, json: { error: 'invalid_grant' } };
    }
    if (request.url === '/revoke') return { status: 200, body: '' };
    if (request.url === '/v1/me/organizations') {
      return request.headers.authorization === 'Bearer revoked-at'
        ? { status: 401, json: { status: 'FAILED', error: 'Unauthorized' } }
        : {
            status: 200,
            json: {
              status: 'OK',
              data: [
                { orgId: 'o2', name: 'Other', role: 'member', current: false },
                { orgId: 'o1', name: 'Acme', role: 'admin', current: true },
              ],
            },
          };
    }
    if (request.headers.authorization === 'Bearer revoked-at') {
      return { status: 401, json: { status: 'FAILED', error: 'Unauthorized' } };
    }
    return { status: 200, json: { status: 'OK', data: {} } };
  });
  // The REST client reads the base URL once, when it is first used.
  process.env.CURRENTS_REST_API_URL = server.url;
});

afterAll(async () => {
  delete process.env.CURRENTS_REST_API_URL;
  await server.close();
});

beforeEach(async () => {
  configDir = await fs.mkdtemp(path.join(os.tmpdir(), 'currents-login-'));
  vi.stubEnv('CURRENTS_CONFIG_DIR', configDir);
  vi.stubEnv('CURRENTS_API_KEY', undefined);
  vi.stubEnv('CURRENTS_DEBUG', undefined);
  server.requests.length = 0;
  tokenStatus = 200;
});

afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  await fs.remove(configDir);
});

const login = (overrides: Partial<OAuthCredentials> = {}) =>
  writeCredentials({
    apiUrl: server.url,
    accessToken: 'stored-at',
    refreshToken: 'stored-rt',
    expiresAt: Date.now() + 3600_000,
    scope: 'openid offline_access projects:read results:read',
    ...overrides,
  });

describe('credentials', () => {
  it('writes the file readable by the owner only', async () => {
    await login();

    expect(getCredentialsPath()).toBe(path.join(configDir, 'credentials.json'));
    expect((await fs.stat(getCredentialsPath())).mode & 0o777).toBe(0o600);
    expect(await readCredentials()).toMatchObject({ accessToken: 'stored-at' });
  });

  it('keeps the mode when an existing file is replaced', async () => {
    await fs.writeFile(getCredentialsPath(), '{}', { mode: 0o644 });
    await login();

    expect((await fs.stat(getCredentialsPath())).mode & 0o777).toBe(0o600);
  });

  it('replaces the file in one step and leaves no temporary file', async () => {
    await login();
    await login({ accessToken: 'second-at' });

    expect(await fs.readdir(configDir)).toEqual(['credentials.json']);
    expect(await readCredentials()).toMatchObject({ accessToken: 'second-at' });
  });

  it('makes an existing directory readable by the owner only', async () => {
    await fs.chmod(configDir, 0o755);
    await login();

    expect((await fs.stat(configDir)).mode & 0o777).toBe(0o700);
  });

  it('uses XDG_CONFIG_HOME when it is absolute', () => {
    vi.stubEnv('CURRENTS_CONFIG_DIR', undefined);
    vi.stubEnv('XDG_CONFIG_HOME', '/xdg');
    expect(getCredentialsPath()).toBe('/xdg/currents/credentials.json');
    vi.stubEnv('XDG_CONFIG_HOME', 'relative');
    expect(getCredentialsPath()).toBe(
      path.join(os.homedir(), '.config', 'currents', 'credentials.json')
    );
  });

  it('reads no login from a missing or broken file', async () => {
    expect(await readCredentials()).toBeNull();
    await fs.writeFile(getCredentialsPath(), 'not json');
    expect(await readCredentials()).toBeNull();
    await deleteCredentials();
    expect(await fs.pathExists(getCredentialsPath())).toBe(false);
  });
});

describe('getLoginCredentials', () => {
  it('returns a login that is not about to expire without a request', async () => {
    await login();

    expect(await getLoginCredentials()).toMatchObject({
      accessToken: 'stored-at',
    });
    expect(server.requests).toEqual([]);
  });

  it('refreshes a login that expires within a minute and stores the new tokens', async () => {
    await login({ expiresAt: Date.now() + 30_000 });

    expect(await getLoginCredentials()).toMatchObject({
      accessToken: 'new-at',
      refreshToken: 'new-rt',
    });
    expect(await readCredentials()).toMatchObject({
      accessToken: 'new-at',
      refreshToken: 'new-rt',
    });
    expect((await fs.stat(getCredentialsPath())).mode & 0o777).toBe(0o600);
  });

  it('asks to log in again when the refresh token is refused', async () => {
    tokenStatus = 400;
    await login({ expiresAt: 0 });

    await expect(getLoginCredentials()).rejects.toThrow(
      /Run "currents login" again/
    );
  });

  it('does not use a login of another REST API', async () => {
    await login({ apiUrl: 'https://api.currents.dev', expiresAt: 0 });

    expect(await getLoginCredentials()).toBeNull();
    expect(server.requests).toEqual([]);
  });
});

describe('resolveApiKey', () => {
  it('uses --api-key or CURRENTS_API_KEY over the login', async () => {
    await login();

    expect(await resolveApiKey('flag-key', 'cli')).toEqual({
      apiKey: 'flag-key',
      fromLogin: false,
    });
    expect(await resolveApiKey('env-key', 'env')).toEqual({
      apiKey: 'env-key',
      fromLogin: false,
    });
  });

  it('uses the login when no key is set, or the variable is blank', async () => {
    await login();

    expect(await resolveApiKey(undefined, undefined)).toEqual({
      apiKey: 'stored-at',
      fromLogin: true,
    });
    expect(await resolveApiKey(' ', 'env')).toEqual({
      apiKey: 'stored-at',
      fromLogin: true,
    });
  });

  it('still refuses a blank --api-key', async () => {
    await login();

    await expect(resolveApiKey('', 'cli')).rejects.toThrow(/is blank/);
  });

  it('is undefined without a login', async () => {
    expect(await resolveApiKey(undefined, undefined)).toEqual({
      apiKey: undefined,
      fromLogin: false,
    });
  });
});

describe('commands with the stored login', () => {
  let output: string;

  beforeEach(() => {
    output = '';
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      output += String(chunk);
      return true;
    });
    vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
      output += String(chunk);
      return true;
    });
    for (const method of ['log', 'error', 'warn'] as const) {
      vi.spyOn(console, method).mockImplementation((...args) => {
        output += `${args.join(' ')}\n`;
      });
    }
    vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new ExitError(code);
    }) as never);
  });

  // commandHandler catches the error thrown by the mocked process.exit(0) and
  // exits again with 1, so the first call is the result.
  const run = async (...args: string[]) => {
    try {
      await getProgram().parseAsync(args, { from: 'user' });
    } catch (e) {
      if (!(e instanceof ExitError)) throw e;
    }
    return vi.mocked(process.exit).mock.calls[0]?.[0];
  };

  it('currents api sends the access token of the login', async () => {
    await login();

    expect(await run('api', '/v1/runs/r1')).toBe(0);
    const request = server.requests.find((r) => r.url === '/v1/runs/r1');
    expect(request?.headers.authorization).toBe('Bearer stored-at');
  });

  it('currents api sends CURRENTS_API_KEY over the login', async () => {
    await login();
    vi.stubEnv('CURRENTS_API_KEY', 'env-key');

    expect(await run('api', '/v1/runs/r1')).toBe(0);
    const request = server.requests.find((r) => r.url === '/v1/runs/r1');
    expect(request?.headers.authorization).toBe('Bearer env-key');
  });

  it('asks to log in again when the API refuses the stored login', async () => {
    await login({ accessToken: 'revoked-at' });

    expect(await run('api', '/v1/runs/r1')).toBe(1);
    expect(output).toMatch(/refused the stored login.*currents login/);
  });

  it('reports a refused CURRENTS_API_KEY as it is', async () => {
    await login();
    vi.stubEnv('CURRENTS_API_KEY', 'revoked-at');

    expect(await run('api', '/v1/runs/r1')).toBe(1);
    expect(output).toContain('answered 401');
    expect(output).not.toContain('currents login');
  });

  it('names currents login when there is no key and no login', async () => {
    expect(await run('api', '/v1/runs/r1')).toBe(1);
    expect(output).toContain('run `currents login`');
  });

  it('currents logout revokes the refresh token and deletes the file', async () => {
    await login();

    await handleLogout();

    const revoke = server.requests.find((r) => r.url === '/revoke');
    expect(new URLSearchParams(revoke?.body.toString()).get('token')).toBe(
      'stored-rt'
    );
    expect(await fs.pathExists(getCredentialsPath())).toBe(false);
    expect(output).not.toContain('stored-rt');
  });

  it('currents whoami shows the organization of the login', async () => {
    await login();

    await handleWhoami();

    expect(output).toContain('Organization: Acme (o1), admin');
    expect(output).toContain(
      'Scopes:       openid offline_access projects:read results:read'
    );
    expect(output).not.toContain('stored-at');
  });

  it('currents whoami asks to log in again when the API refuses the token', async () => {
    await login({ accessToken: 'revoked-at' });

    await expect(handleWhoami()).rejects.toThrow(
      /refused the stored login.*currents login/
    );
  });
});
