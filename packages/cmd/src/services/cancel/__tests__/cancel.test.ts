import { AxiosError, AxiosResponse } from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cancelRun } from '../../../api';
import { setCancelCommandConfig } from '../../../config/cancel';
import { handleCancelRun } from '../index';

vi.mock('../../../api', () => ({
  cancelRun: vi.fn(),
}));

const mockCancelRun = vi.mocked(cancelRun);

describe('handleCancelRun', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Environment values win over the options passed here, so clear the ones a
    // developer running the suite may have exported.
    vi.stubEnv('CURRENTS_RECORD_KEY', undefined);
    vi.stubEnv('CURRENTS_PROJECT_ID', undefined);
    vi.stubEnv('CURRENTS_CI_BUILD_ID', undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('forwards the record key, project and build id', async () => {
    mockCancelRun.mockResolvedValue({
      status: 'OK',
      data: { runId: 'run-1', cancellation: null },
    });

    setCancelCommandConfig({
      recordKey: 'key',
      projectId: 'proj',
      ciBuildId: 'build-1',
    });

    await handleCancelRun();

    expect(mockCancelRun).toHaveBeenCalledWith({
      recordKey: 'key',
      projectId: 'proj',
      ciBuildId: 'build-1',
    });
  });

  it('propagates request failures so the command exits non-zero', async () => {
    mockCancelRun.mockRejectedValue(new Error('nope'));

    setCancelCommandConfig({
      recordKey: 'key',
      projectId: 'proj',
      ciBuildId: 'build-1',
    });

    await expect(handleCancelRun()).rejects.toThrow('nope');
  });

  it('succeeds when there is no run to cancel', async () => {
    mockCancelRun.mockRejectedValue(
      new AxiosError('Not found', undefined, undefined, undefined, {
        status: 404,
      } as AxiosResponse)
    );

    setCancelCommandConfig({
      recordKey: 'key',
      projectId: 'proj',
      ciBuildId: 'build-1',
    });

    await expect(handleCancelRun()).resolves.toBeNull();
  });
});
