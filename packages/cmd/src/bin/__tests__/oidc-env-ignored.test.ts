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
import { ApiServer, startApiServer } from '../../test-utils/api-server';
import { getProgram } from '../program';

class ExitError extends Error {
  constructor(public code: number | undefined) {
    super(`exit ${code}`);
  }
}

const JWT = 'provider-jwt';
const ANSI = /\x1b\[[0-9;]*m/g;

const RECORD_KEY_ERROR =
  'Record key is required: pass --key or set CURRENTS_RECORD_KEY; in CI, run `currents ci auth get-record-key` and set CURRENTS_RECORD_KEY to its output';
const API_KEY_ERROR =
  'API key is required: pass --api-key or set CURRENTS_API_KEY; in CI, run `currents ci auth get-api-token` and set CURRENTS_API_KEY to its output';
const SESSION_KEY_ERROR =
  'Record key or API key is required: pass --key or --api-key, or set CURRENTS_RECORD_KEY or CURRENTS_API_KEY; in CI, run `currents ci auth get-record-key` and set CURRENTS_RECORD_KEY to its output';

const commands: [string[], string][] = [
  [['run', 'upload', '--report-dir', '.'], RECORD_KEY_ERROR],
  [['run', 'cancel', '--ci-build-id', 'b1'], RECORD_KEY_ERROR],
  [['cache', 'set', '--id', 'c1'], RECORD_KEY_ERROR],
  [['cache', 'get', '--id', 'c1'], RECORD_KEY_ERROR],
  [['session', 'start', '--title', 't'], SESSION_KEY_ERROR],
  [['session', 'attach', 'file.png', '--session-id', 's1'], SESSION_KEY_ERROR],
  [['session', 'share', '--session-id', 's1'], SESSION_KEY_ERROR],
  [['api', '/v1/runs/r1'], API_KEY_ERROR],
  [['run', 'get', '--ci-build-id', 'b1'], API_KEY_ERROR],
];

describe('commands other than ci auth with OIDC in the environment', () => {
  // The director, the REST API and GitHub.
  let server: ApiServer;
  let stderr: string;

  beforeAll(async () => {
    server = await startApiServer((request) =>
      request.url.startsWith('/github-token')
        ? { status: 200, json: { value: JWT } }
        : { status: 200, json: {} }
    );
    // The HTTP clients read the base URLs once, when they are first used.
    process.env.CURRENTS_API_URL = server.url;
    process.env.CURRENTS_REST_API_URL = server.url;
  });

  afterAll(async () => {
    delete process.env.CURRENTS_API_URL;
    delete process.env.CURRENTS_REST_API_URL;
    await server.close();
  });

  beforeEach(() => {
    server.requests.length = 0;
    stderr = '';
    for (const name of [
      'CURRENTS_API_KEY',
      'CURRENTS_RECORD_KEY',
      'CURRENTS_CI_BUILD_ID',
      'CURRENTS_DEBUG',
    ]) {
      vi.stubEnv(name, undefined);
    }
    vi.stubEnv('CURRENTS_PROJECT_ID', 'p1');
    vi.stubEnv('GITHUB_ACTIONS', 'true');
    vi.stubEnv('ACTIONS_ID_TOKEN_REQUEST_URL', `${server.url}/github-token`);
    vi.stubEnv('ACTIONS_ID_TOKEN_REQUEST_TOKEN', 'request-secret');
    vi.stubEnv('CURRENTS_OIDC_TOKEN', JWT);
    vi.stubEnv('CURRENTS_OIDC_API_TOKEN', JWT);
    vi.stubEnv('CURRENTS_OIDC_PROVIDER', 'github-actions');
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
      stderr += String(chunk);
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
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  async function run(args: string[]) {
    try {
      await getProgram().parseAsync(args, { from: 'user' });
    } catch (e) {
      if (!(e instanceof ExitError)) throw e;
      return e.code;
    }
    return undefined;
  }

  it.each(commands)(
    '%j asks for a key and sends no request',
    async (args, message) => {
      expect(await run(args)).toBe(1);

      expect(server.requests).toEqual([]);
      expect(stderr.replace(ANSI, '')).toContain(message);
      expect(stderr).not.toContain(JWT);
    }
  );

  // A command that allows unknown options takes the flag and its value as
  // arguments it does not expect.
  it.each(commands)('%j has no --oidc-token option', async (args) => {
    expect(await run([...args, '--oidc-token', JWT])).toBe(1);

    expect(stderr).toMatch(/unknown option '--oidc-token'|too many arguments/);
    expect(server.requests).toEqual([]);
  });

  it('api sends the configured key, without an exchange or a revoke', async () => {
    vi.stubEnv('CURRENTS_API_KEY', 'configured-key');

    expect(await run(['api', '/v1/runs/r1'])).toBe(0);

    expect(server.requests.map((r) => r.url)).toEqual(['/v1/runs/r1']);
    expect(server.requests[0].headers.authorization).toBe(
      'Bearer configured-key'
    );
  });

  it.each(['', '   '])(
    'api fails on the blank --api-key %j, without a request',
    async (key) => {
      vi.stubEnv('CURRENTS_API_KEY', 'configured-key');

      expect(await run(['api', '/v1/runs/r1', '--api-key', key])).toBe(1);

      expect(stderr).toContain('--api-key is blank');
      expect(server.requests).toEqual([]);
    }
  );

  it('api treats a blank CURRENTS_API_KEY as unset', async () => {
    vi.stubEnv('CURRENTS_API_KEY', '  ');

    expect(await run(['api', '/v1/runs/r1'])).toBe(1);

    expect(stderr.replace(ANSI, '')).toContain(API_KEY_ERROR);
    expect(server.requests).toEqual([]);
  });
});
