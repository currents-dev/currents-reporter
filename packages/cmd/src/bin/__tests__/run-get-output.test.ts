import { warn } from '@logger';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getRun } from '../../api';
import { getProgram } from '../program';

vi.mock('../../api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../api')>()),
  getRun: vi.fn(),
}));

class ExitError extends Error {
  constructor(public code: number | undefined) {
    super(`exit ${code}`);
  }
}

describe('run get output', () => {
  let stdout: string;
  let stderr: string;
  const run = {
    runId: 'r1',
    pwLastRun: { status: 'failed', failedTests: ['t'] },
  };

  beforeEach(() => {
    stdout = '';
    stderr = '';
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      stdout += String(chunk);
      return true;
    });
    vi.spyOn(console, 'log').mockImplementation((...args) => {
      stdout += args.join(' ') + '\n';
    });
    vi.spyOn(console, 'error').mockImplementation((...args) => {
      stderr += args.join(' ') + '\n';
    });
    vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new ExitError(code);
    }) as never);
    vi.mocked(getRun).mockImplementation(async () => {
      warn('Network request failed. Next attempt is in 3s (1/3).');
      return { status: 'OK', data: run };
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const runGet = async (...args: string[]) => {
    try {
      await getProgram().parseAsync(
        [
          'run',
          'get',
          '--api-key=a',
          '--project-id=p',
          '--ci-build-id=b',
          ...args,
        ],
        { from: 'user' }
      );
    } catch (e) {
      if (!(e instanceof ExitError)) throw e;
    }
    // commandHandler catches the error thrown by the mocked process.exit(0)
    // and exits again with 1, so the first call is the result.
    return vi.mocked(process.exit).mock.calls[0]?.[0];
  };

  it('prints only the JSON on stdout and warnings on stderr', async () => {
    expect(await runGet()).toBe(0);

    expect(JSON.parse(stdout)).toEqual(run);
    expect(stderr).toContain('Next attempt is in 3s');
  });

  it('prints the last run with --pw-last-run', async () => {
    expect(await runGet('--pw-last-run')).toBe(0);

    expect(JSON.parse(stdout)).toEqual(run.pwLastRun);
  });

  it('fails when the API answers without the last run', async () => {
    vi.mocked(getRun).mockResolvedValue({
      status: 'OK',
      data: { runId: 'r1' } as never,
    });

    expect(await runGet('--pw-last-run')).toBe(1);

    expect(stdout).toBe('');
    expect(stderr).toContain('without the status and failed tests of the run');
  });
});
