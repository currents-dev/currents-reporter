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
    expect(stderr).toContain('upload [options]');
    expect(handleCurrentsReport).not.toHaveBeenCalled();
    expect(getCurrentsConfig).not.toHaveBeenCalled();
  });

  it('fails without uploading when options are given without a command', async () => {
    expect(await run(['--key', 'x', '--project-id', 'y'])).toBe(1);

    expect(stderr).toContain('upload is no longer the default command');
    expect(stderr).toContain("currents upload ...'");
    expect(stderr).toContain("run 'currents --help' for usage");
    expect(handleCurrentsReport).not.toHaveBeenCalled();
    expect(getCurrentsConfig).not.toHaveBeenCalled();
  });

  it('prints the help of the upload command', async () => {
    expect(await run(['upload', '--help'])).toBe(0);

    expect(stdout).toContain('Usage: currents upload [options]');
    expect(handleCurrentsReport).not.toHaveBeenCalled();
  });

  it('prints the help with --help', async () => {
    expect(await run(['--help'])).toBe(0);

    expect(stdout).toContain('Usage: currents [options] [command]');
    expect(stdout).toContain(
      "Run 'currents <command> --help' for the options and examples of a command."
    );
    for (const command of [
      'currents upload --key',
      'currents convert --input-format',
      'currents cache set --key',
      'currents run cancel --key',
      'currents run attach --key',
      'currents session start --api-key',
    ]) {
      expect(stdout).toContain(command);
    }
  });

  it('points to the skill command before the documentation link', async () => {
    expect(await run(['--help'])).toBe(0);

    expect(stdout).toMatch(/^\s+skill \[options\]/m);
    expect(stdout).toContain(
      'Agent skill:   currents skill --install\nDocumentation: https://docs.currents.dev'
    );
  });

  it('does not list the deprecated cancel command in the root help', async () => {
    expect(await run(['--help'])).toBe(0);

    expect(stdout).not.toMatch(/^\s+cancel\b/m);
    expect(stdout).not.toContain('currents cancel');
  });

  it('lists attach and cancel in the help of run', async () => {
    expect(await run(['run', '--help'])).toBe(0);

    expect(stdout).toMatch(/^\s+attach\b/m);
    expect(stdout).toMatch(/^\s+cancel\b/m);
  });

  it('prints the examples of run cancel with the full command path', async () => {
    expect(await run(['run', 'cancel', '--help'])).toBe(0);

    expect(stdout).toContain('Usage: currents run cancel [options]');
    expect(stdout).toContain('run: npx currents run cancel');
    expect(stdout).not.toContain('currents cancel');
  });
});
