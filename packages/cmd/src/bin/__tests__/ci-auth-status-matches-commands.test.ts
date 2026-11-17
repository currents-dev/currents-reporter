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
import { resetOidcExchange } from '../../lib/oidc';
import {
  ApiServer,
  RecordedRequest,
  startApiServer,
} from '../../test-utils/api-server';
import { getProgram } from '../program';

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

const OIDC_JWT = 'provider-jwt';
const API_KEY = 'dashboard-api-key';

/**
 * Every command that records, and what the program gives it: `--api-key` is an
 * option of the commands in `acceptsApiKey`, and only they use CURRENTS_API_KEY
 * where a record key is missing (useOidcRecordKey).
 */
const acceptsApiKey: [string, string[]][] = [
  ['run attach', ['run', 'attach', 'x.txt']],
  ['session start', ['session', 'start']],
  ['session attach', ['session', 'attach', 'x.txt']],
  ['session share', ['session', 'share']],
];
const ignoresApiKey: [string, string[]][] = [
  ['run upload', ['run', 'upload']],
  ['run cancel', ['run', 'cancel', '--ci-build-id', 'b1']],
  ['cache set', ['cache', 'set', '--id', 'c1', '--path', 'x']],
  ['cache get', ['cache', 'get', '--id', 'c1']],
];

describe('ci auth status and the commands that record', () => {
  let server: ApiServer;
  let stdout: string;

  const exchanges = () =>
    server.requests.filter(
      (r: RecordedRequest) => r.url.split('?')[0] === '/oidc/token'
    ).length;

  beforeAll(async () => {
    server = await startApiServer((request) => {
      if (request.url.split('?')[0] === '/oidc/token') {
        return {
          status: 200,
          json: { access_token: 'crnts_ci_status', expires_in: 600 },
        };
      }
      return { status: 200 };
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
    stdout = '';
    resetOidcExchange();
    setOidcAudienceOption(undefined);
    for (const name of [
      'CURRENTS_RECORD_KEY',
      'CURRENTS_DEBUG',
      'ACTIONS_ID_TOKEN_REQUEST_URL',
      'ACTIONS_ID_TOKEN_REQUEST_TOKEN',
      'CURRENTS_OIDC_API_TOKEN',
      'GITHUB_ACTIONS',
      'GITLAB_CI',
    ]) {
      vi.stubEnv(name, undefined);
    }
    vi.stubEnv('CURRENTS_PROJECT_ID', 'p1');
    vi.stubEnv('CURRENTS_API_KEY', API_KEY);
    vi.stubEnv('CURRENTS_OIDC_TOKEN', OIDC_JWT);
    vi.spyOn(process.stdout, 'write').mockImplementation(((
      chunk: unknown,
      ...rest: unknown[]
    ) => {
      stdout += String(chunk);
      (rest.find((arg) => typeof arg === 'function') as () => void)?.();
      return true;
    }) as never);
    vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    vi.spyOn(console, 'log').mockReturnValue();
    vi.spyOn(console, 'error').mockReturnValue();
    vi.spyOn(console, 'warn').mockReturnValue();
    vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new ExitError(code);
    }) as never);
  });

  afterEach(() => {
    disableDebug();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  async function run(args: string[]) {
    try {
      await getProgram().parseAsync(args, { from: 'user' });
    } catch (e) {
      if (!(e instanceof ExitError)) throw e;
    }
  }

  /**
   * The recording credential that `ci auth status` names for a command: the
   * only "Credential:" line of the "Recording:" section, or the one that lists
   * the command.
   */
  async function recordingCredential(command: string) {
    stdout = '';
    await run(['ci', 'auth', 'status']);
    const lines = stdout.split('\n');
    const section = lines.slice(lines.indexOf('Recording:') + 1);
    const credentials = section
      .slice(0, section.indexOf(''))
      .filter((line) => line.startsWith('  Credential: '))
      .map((line) => line.replace('  Credential: ', ''));
    if (credentials.length === 1) return credentials[0];
    const suffix = (names: string) => names.split(', ').includes(command);
    return credentials
      .map((line) => /^(.*) \((.*)\)$/.exec(line))
      .find((match) => match && suffix(match[2]))?.[1];
  }

  describe('with CURRENTS_API_KEY and an OIDC token in the environment', () => {
    it.each(acceptsApiKey)(
      '%s uses the API key, and the status says so',
      async (name, args) => {
        await run(args);

        expect(exchanges()).toBe(0);
        expect(await recordingCredential(name)).toBe('CURRENTS_API_KEY');
      }
    );

    // These commands have no --api-key option, so useOidcRecordKey exchanges
    // the OIDC token for a record key and the API key is not used.
    it.each(ignoresApiKey)(
      '%s exchanges the OIDC token, and the status says OIDC',
      async (name, args) => {
        await run(args);

        expect(exchanges()).toBe(1);
        expect(await recordingCredential(name)).toBe(
          'OIDC, token in CURRENTS_OIDC_TOKEN'
        );
      }
    );
  });
});
