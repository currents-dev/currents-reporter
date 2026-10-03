import util from 'util';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createCache,
  createRun,
  getRefCacheMeta,
  retrieveCache,
} from '../../api';
import { setAPIGetRunCommandConfig } from '../../config/api';
import { setCacheGetCommandConfig } from '../../config/cache';
import { setCancelCommandConfig } from '../../config/cancel';
import {
  getRunAttachConfig,
  getSessionStartConfig,
} from '../../config/session';
import { setCurrentsConfig } from '../../config/upload';

const debugLines = vi.hoisted(() => [] as string[]);

vi.mock('../../debug', () => {
  const debug = Object.assign(
    (...args: unknown[]) => debugLines.push(util.format(...args)),
    { extend: () => debug }
  );
  return { debug, enableDebug: vi.fn(), setTraceFilePath: vi.fn() };
});
vi.mock('../../http', () => ({
  makeRequest: vi.fn().mockResolvedValue({ data: {} }),
}));

const apiKey = 'api-key-secret';
const recordKey = 'record-key-secret';

describe('debug output', () => {
  beforeEach(() => {
    debugLines.length = 0;
  });

  it.each([
    [
      'run upload config',
      () => setCurrentsConfig({ recordKey, projectId: 'p' }),
    ],
    [
      'cache get config',
      () =>
        setCacheGetCommandConfig({ recordKey, matrixIndex: 1, matrixTotal: 1 }),
    ],
    [
      'run cancel config',
      () => setCancelCommandConfig({ recordKey, projectId: 'p', runId: 'r' }),
    ],
    [
      'run get config',
      () =>
        setAPIGetRunCommandConfig({ apiKey, projectId: 'p', ciBuildId: 'b' }),
    ],
    [
      'run attach config',
      () => getRunAttachConfig({ apiKey, recordKey, projectId: 'p' }),
    ],
    [
      'session start config',
      () => getSessionStartConfig({ apiKey, projectId: 'p', title: 't' }),
    ],
    ['cache upload request', () => createCache({ recordKey, ci: {} })],
    [
      'cache download request',
      () => retrieveCache({ recordKey, cacheKey: 'c' }),
    ],
    ['cache meta request', () => getRefCacheMeta({ recordKey, ci: {} })],
    [
      'run creation request',
      () =>
        createRun({
          recordKey,
          config: { currents: { recordKey, projectId: 'p' } },
        } as unknown as Parameters<typeof createRun>[0]),
    ],
  ])('hides the keys in the %s', async (_name, action) => {
    await action();

    expect(debugLines.length).toBeGreaterThan(0);
    expect(debugLines.join('\n')).not.toMatch(/secret/);
  });
});
