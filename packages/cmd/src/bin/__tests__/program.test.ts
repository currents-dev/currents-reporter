import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getCurrentsConfig } from '../../config/upload';
import { handleCurrentsReport } from '../../services';
import { getProgram } from '../program';

vi.mock('../../services', () => ({
  handleCurrentsReport: vi.fn(),
}));
vi.mock('../../config/upload', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../config/upload')>()),
  setCurrentsConfig: vi.fn(),
  getCurrentsConfig: vi.fn(),
}));

class ExitError extends Error {
  constructor(public code: number | undefined) {
    super(`exit ${code}`);
  }
}

describe('currents program', () => {
  let stdout: string;
  let stderr: string;

  beforeEach(() => {
    stdout = '';
    stderr = '';
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      stdout += String(chunk);
      return true;
    });
    vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
      stderr += String(chunk);
      return true;
    });
    vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new ExitError(code);
    }) as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const run = async (args: string[]) => {
    try {
      await getProgram().parseAsync(args, { from: 'user' });
    } catch (e) {
      if (e instanceof ExitError) return e.code;
      throw e;
    }
    return undefined;
  };

  it('prints the help and exits with 1 when there is no command', async () => {
    expect(await run([])).toBe(1);

    expect(stderr).toContain('Usage: currents [options] [command]');
    expect(stderr).toMatch(/^\s+run\b/m);
    expect(handleCurrentsReport).not.toHaveBeenCalled();
    expect(getCurrentsConfig).not.toHaveBeenCalled();
  });

  it('says upload is no longer the default when the upload variables are set', async () => {
    vi.stubEnv('CURRENTS_RECORD_KEY', 'k');
    vi.stubEnv('CURRENTS_PROJECT_ID', 'p');
    try {
      expect(await run([])).toBe(1);
    } finally {
      vi.unstubAllEnvs();
    }

    expect(stderr).toContain('upload is no longer the default command');
    expect(stderr).toContain('Usage: currents [options] [command]');
    expect(handleCurrentsReport).not.toHaveBeenCalled();
  });

  it('prints only the help for --help when the upload variables are set', async () => {
    vi.stubEnv('CURRENTS_RECORD_KEY', 'k');
    try {
      expect(await run(['--help'])).toBe(0);
    } finally {
      vi.unstubAllEnvs();
    }
    expect(stdout).not.toContain('upload is no longer the default command');
  });

  it('fails without uploading when options are given without a command', async () => {
    expect(await run(['--key', 'x', '--project-id', 'y'])).toBe(1);

    expect(stderr).toContain('upload is no longer the default command');
    expect(stderr).toContain("currents run upload ...'");
    expect(stderr).toContain("run 'currents --help' for usage");
    expect(handleCurrentsReport).not.toHaveBeenCalled();
    expect(getCurrentsConfig).not.toHaveBeenCalled();
  });

  it.each([['--key=x'], ['-p', 'y'], ['--report-dir', 'r']])(
    'points to run upload for the upload option %s',
    async (...args) => {
      expect(await run(args)).toBe(1);

      expect(stderr).toContain('upload is no longer the default command');
    }
  );

  it('refuses a number of days a share link cannot have', async () => {
    expect(await run(['session', 'share', '--expires-in-days', '5'])).toBe(1);

    expect(stderr).toContain("argument '5' is invalid");
  });

  it('fails with the usual error for another unknown option', async () => {
    expect(await run(['--nope'])).toBe(1);

    expect(stderr).toContain("error: unknown option '--nope'");
    expect(stderr).not.toContain('upload is no longer the default command');
  });

  it('prints the help of the upload command', async () => {
    expect(await run(['run', 'upload', '--help'])).toBe(0);

    expect(stdout).toContain('Usage: currents run upload [options]');
    expect(stdout).not.toMatch(/currents upload/);
    expect(handleCurrentsReport).not.toHaveBeenCalled();
  });

  it('prints the examples of run get with the full command path', async () => {
    expect(await run(['run', 'get', '--help'])).toBe(0);

    expect(stdout).toContain('Usage: currents run get [options]');
    expect(stdout).toContain('currents run get --api-key');
    expect(stdout).not.toContain('get-run');
  });

  it('prints the help of the hidden api get-run command', async () => {
    expect(await run(['api', 'get-run', '--help'])).toBe(0);

    expect(stdout).toContain('Usage: currents api get-run [options]');
  });

  it('prints the help of the hidden upload command', async () => {
    expect(await run(['upload', '--help'])).toBe(0);

    expect(stdout).toContain('Usage: currents upload [options]');
  });

  it('prints the help with --help', async () => {
    expect(await run(['--help'])).toBe(0);

    expect(stdout).toContain('Usage: currents [options] [command]');
    expect(stdout).toContain(
      "Run 'currents <command> --help' for the options and examples of a command."
    );
    for (const command of [
      'currents run upload --key',
      '--input-format junit --input-file "./*.xml"',
      'currents cache set --key',
      'currents run cancel --key',
      'currents run attach --key',
      'currents session start --api-key',
    ]) {
      expect(stdout).toContain(command);
    }
  });

  it('lists the commands under group headings', async () => {
    expect(await run(['--help'])).toBe(0);

    expect(stdout).toMatch(
      /Test runs:\n\s+run\b[^\n]*\n\nEvidence:\n\s+session\b[^\n]*\n\nCI utilities:\n\s+cache\b[^\n]*\n\nOther:\n/
    );
    expect(stdout).toMatch(/Other:\n(\s+\S.*\n)*\s+help \[command\]/);
  });

  it('points to the skill command before the documentation link', async () => {
    expect(await run(['--help'])).toBe(0);

    expect(stdout).toMatch(/^\s+skill \[options\]/m);
    expect(stdout).toContain(
      'Agent skill:   currents skill --install\nDocumentation: https://docs.currents.dev'
    );
  });

  it.each(['cancel', 'upload', 'convert', 'api'])(
    'does not list the legacy %s command in the root help',
    async (command) => {
      expect(await run(['--help'])).toBe(0);

      expect(stdout).not.toMatch(new RegExp(`^\\s+${command}\\b`, 'm'));
      expect(stdout).not.toContain(`currents ${command}`);
    }
  );

  it('lists its commands in the help of run', async () => {
    expect(await run(['run', '--help'])).toBe(0);

    for (const command of ['upload', 'attach', 'get', 'cancel']) {
      expect(stdout).toMatch(new RegExp(`^\\s+${command}\\b`, 'm'));
    }
  });

  it('prints the examples of run cancel with the full command path', async () => {
    expect(await run(['run', 'cancel', '--help'])).toBe(0);

    expect(stdout).toContain('Usage: currents run cancel [options]');
    expect(stdout).toContain('run: npx currents run cancel');
    expect(stdout).not.toContain('currents cancel');
  });
});
