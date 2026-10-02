import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cancelRun } from '../../../api';
import { getProgram } from '../../../bin/program';
import { getCancelCommand } from '../index';

vi.mock('../../../api', () => ({
  cancelRun: vi.fn(),
}));

const mockCancelRun = vi.mocked(cancelRun);

describe('cancel command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Environment values win over CLI flags, so clear the ones a developer
    // running the suite may have exported.
    vi.stubEnv('CURRENTS_RECORD_KEY', undefined);
    vi.stubEnv('CURRENTS_PROJECT_ID', undefined);
    vi.stubEnv('CURRENTS_CI_BUILD_ID', undefined);
    // commandHandler exits the process on both paths.
    vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
    mockCancelRun.mockResolvedValue({
      status: 'OK',
      data: { runId: 'run-1', cancellation: null },
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  // Commander exposes `--key` as `key`, the config calls it `recordKey`.
  it('cancels with a record key passed as a flag', async () => {
    await getCancelCommand('currents').parseAsync(
      ['--key', 'cli-key', '--project-id', 'proj', '--ci-build-id', 'build-1'],
      { from: 'user' }
    );

    expect(mockCancelRun).toHaveBeenCalledWith({
      recordKey: 'cli-key',
      projectId: 'proj',
      ciBuildId: 'build-1',
    });
  });

  it('cancels with a record key from the environment', async () => {
    vi.stubEnv('CURRENTS_RECORD_KEY', 'env-key');

    await getCancelCommand('currents').parseAsync(
      ['--project-id', 'proj', '--ci-build-id', 'build-1'],
      { from: 'user' }
    );

    expect(mockCancelRun).toHaveBeenCalledWith({
      recordKey: 'env-key',
      projectId: 'proj',
      ciBuildId: 'build-1',
    });
  });

  describe('through the program', () => {
    const DEPRECATION_WARNING =
      "'currents cancel' is deprecated and will be removed in the next major version. Use 'currents run cancel'.\n";
    const args = ['--key', 'k', '--project-id', 'proj', '--ci-build-id', 'b1'];
    let stderr: string;

    beforeEach(() => {
      stderr = '';
      vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
        stderr += String(chunk);
        return true;
      });
    });

    it('cancels with currents run cancel without a warning', async () => {
      await getProgram().parseAsync(['run', 'cancel', ...args], {
        from: 'user',
      });

      expect(mockCancelRun).toHaveBeenCalledWith({
        recordKey: 'k',
        projectId: 'proj',
        ciBuildId: 'b1',
      });
      expect(process.exit).toHaveBeenCalledWith(0);
      expect(stderr).not.toContain('deprecated');
    });

    it('cancels with currents cancel and warns on stderr', async () => {
      await getProgram().parseAsync(['cancel', ...args], { from: 'user' });

      expect(mockCancelRun).toHaveBeenCalledWith({
        recordKey: 'k',
        projectId: 'proj',
        ciBuildId: 'b1',
      });
      expect(process.exit).toHaveBeenCalledWith(0);
      expect(stderr.startsWith(DEPRECATION_WARNING)).toBe(true);
    });

    it('exits with 1 on a failure, as run cancel does', async () => {
      mockCancelRun.mockRejectedValue(new Error('boom'));

      await getProgram().parseAsync(['cancel', ...args], { from: 'user' });
      expect(process.exit).toHaveBeenLastCalledWith(1);

      await getProgram().parseAsync(['run', 'cancel', ...args], {
        from: 'user',
      });
      expect(process.exit).toHaveBeenLastCalledWith(1);
    });
  });
});
