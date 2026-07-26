import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cancelRun } from '../../../api';
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
});
