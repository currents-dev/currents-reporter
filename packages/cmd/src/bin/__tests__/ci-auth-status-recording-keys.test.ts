import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getProgram } from '../program';

class ExitError extends Error {
  constructor(public code: number | undefined) {
    super(`exit ${code}`);
  }
}

const API_KEY = 'dashboard-api-key';

/**
 * The visible commands with `--key`, split by whether they also have
 * `--api-key`. The tests run only `ci auth status`, not these commands.
 */
const acceptsApiKey = [
  'run attach',
  'session start',
  'session attach',
  'session share',
];
const ignoresApiKey = ['run upload', 'run cancel', 'cache set', 'cache get'];

describe('the key ci auth status names for each recording command', () => {
  let stdout: string;

  beforeEach(() => {
    stdout = '';
    for (const name of ['CURRENTS_RECORD_KEY', 'CURRENTS_DEBUG']) {
      vi.stubEnv(name, undefined);
    }
    vi.stubEnv('CURRENTS_API_KEY', API_KEY);
    vi.stubEnv('CURRENTS_OIDC_TOKEN', 'provider-jwt');
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
    it.each(acceptsApiKey)('%s: CURRENTS_API_KEY', async (name) => {
      expect(await recordingCredential(name)).toBe('CURRENTS_API_KEY');
    });

    it.each(ignoresApiKey)('%s: none', async (name) => {
      expect(await recordingCredential(name)).toBe('none');
    });
  });

  // getAuthHeaders sends a whitespace-only key as it is, so status names it.
  describe('with a whitespace-only key', () => {
    it.each([...acceptsApiKey, ...ignoresApiKey])(
      '%s: CURRENTS_RECORD_KEY',
      async (name) => {
        vi.stubEnv('CURRENTS_RECORD_KEY', ' ');

        expect(await recordingCredential(name)).toBe('CURRENTS_RECORD_KEY');
      }
    );

    it.each(acceptsApiKey)('%s: CURRENTS_API_KEY', async (name) => {
      vi.stubEnv('CURRENTS_API_KEY', ' ');

      expect(await recordingCredential(name)).toBe('CURRENTS_API_KEY');
    });
  });
});
