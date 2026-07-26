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
    vi.stubEnv('CURRENTS_RUN_ID', undefined);
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
      runId: undefined,
    });
  });

  it('forwards the run id when one is configured', async () => {
    mockCancelRun.mockResolvedValue({
      status: 'OK',
      data: { runId: 'run-1', cancellation: null },
    });

    setCancelCommandConfig({
      recordKey: 'key',
      projectId: 'proj',
      runId: 'run-1',
    });

    await handleCancelRun();

    expect(mockCancelRun).toHaveBeenCalledWith({
      recordKey: 'key',
      projectId: 'proj',
      ciBuildId: undefined,
      runId: 'run-1',
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
    mockCancelRun.mockResolvedValue({
      status: 'OK',
      data: { runId: null, cancellation: null },
    });

    setCancelCommandConfig({
      recordKey: 'key',
      projectId: 'proj',
      ciBuildId: 'build-1',
    });

    await expect(handleCancelRun()).resolves.toEqual({
      status: 'OK',
      data: { runId: null, cancellation: null },
    });
  });

  // "No run to cancel" is a 200 with a null runId. A 404 means something else -
  // a director without the cancel route, or an api url pointing elsewhere - and
  // must not be mistaken for it.
  it('propagates a 404', async () => {
    mockCancelRun.mockRejectedValue(
      new AxiosError('Not found', undefined, undefined, undefined, {
        status: 404,
        data: 'Not found',
      } as AxiosResponse)
    );

    setCancelCommandConfig({
      recordKey: 'key',
      projectId: 'proj',
      ciBuildId: 'build-1',
    });

    await expect(handleCancelRun()).rejects.toThrow('Not found');
  });
});
