import { isAxiosError } from 'axios';
import path from 'path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { retrieveCache } from '../../../api';
import { PRESETS } from '../../../commands/cache/options';
import {
  CacheCommandConfig,
  CacheGetCommandConfig,
  getCacheCommandConfig,
} from '../../../config/cache';
import { getCI } from '../../../env/ciProvider';
import { success, warnWithNoTrace } from '../../../logger';
import { unzipBuffer } from '../fs';
import { handleGetCache } from '../get';
import { download } from '../network';
import { handlePostLastRunPreset, handlePreLastRunPreset } from '../presets';

const mockConfig: {
  type: 'GET_COMMAND_CONFIG';
  values: (CacheCommandConfig & CacheGetCommandConfig) | null;
} = {
  type: 'GET_COMMAND_CONFIG',
  values: {
    recordKey: 'testKey',
    id: 'testId',
    preset: PRESETS.lastRun,
    matrixIndex: 0,
    matrixTotal: 1,
    outputDir: 'testOutput',
    continue: false,
  },
};

const mockCI: ReturnType<typeof getCI> = {
  provider: 'testCI',
  ciBuildId: { source: 'random', value: 'auto-ci-build-id' },
  params: {},
};

const mockCacheResult = {
  readUrl: 'http://cache.url',
  metaReadUrl: 'http://meta.url',
  cacheId: 'cacheId123',
  orgId: 'org123',
};

const mockMetaFile = { version: '1.0' };
const mockedBuffer = Buffer.from(JSON.stringify(mockMetaFile));
vi.mock('../../../config/cache');
vi.mock('../../../env/ciProvider');
vi.mock('../../../api');
vi.mock('../network');
vi.mock('../fs');
vi.mock('../presets');
vi.mock('axios');
vi.mock('../../../logger');

describe('handleGetCache', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCacheCommandConfig).mockReturnValue(mockConfig);
    vi.mocked(getCI).mockReturnValue(mockCI);
    vi.mocked(retrieveCache).mockResolvedValue(mockCacheResult);
    vi.mocked(download).mockResolvedValue(mockedBuffer);
    vi.mocked(unzipBuffer).mockResolvedValue(undefined);
  });

  const expectCacheRetrievalAndDownload = async () => {
    await handleGetCache();
    expect(retrieveCache).toHaveBeenCalledWith({
      recordKey: 'testKey',
      ci: mockCI,
      id: 'testId',
      config: { matrixIndex: 0, matrixTotal: 1 },
    });
    expect(download).toHaveBeenCalledWith('http://cache.url');
    expect(unzipBuffer).toHaveBeenCalledWith(
      mockedBuffer,
      // @ts-ignore
      path.resolve(mockConfig.values?.outputDir)
    );
  };

  it('should throw an error if config type is not GET_COMMAND_CONFIG', async () => {
    vi.mocked(getCacheCommandConfig).mockReturnValue({
      type: 'SET_COMMAND_CONFIG',
      values: mockConfig.values,
    });
    await expect(handleGetCache()).rejects.toThrow('Config is missing!');
  });

  it('should throw an error if config values are not set', async () => {
    vi.mocked(getCacheCommandConfig).mockReturnValue({
      type: 'GET_COMMAND_CONFIG',
      values: null,
    });
    await expect(handleGetCache()).rejects.toThrow('Config is missing!');
  });

  it('should call handlePreLastRunPreset if preset is lastRun', async () => {
    await handleGetCache();
    expect(handlePreLastRunPreset).toHaveBeenCalledWith(
      mockConfig.values,
      mockCI
    );
  });

  it('should retrieve cache and download archive', async () => {
    await expectCacheRetrievalAndDownload();
  });

  it('should download and parse meta file', async () => {
    const jsonParseSpy = vi.spyOn(JSON, 'parse');
    await handleGetCache();
    expect(download).toHaveBeenCalledWith('http://meta.url');
    expect(jsonParseSpy).toHaveBeenCalledWith(
      Buffer.from(JSON.stringify(mockMetaFile)).toString('utf-8')
    );
  });

  it('should call handlePostLastRunPreset if preset is lastRun', async () => {
    await handleGetCache();
    expect(handlePostLastRunPreset).toHaveBeenCalledWith(
      mockConfig.values,
      mockCI,
      undefined
    );
  });

  it('should log success message when cache is restored', async () => {
    await handleGetCache();
    expect(success).toHaveBeenCalledWith(
      'Cache restored. Cache ID: %s',
      mockCacheResult.cacheId
    );
  });

  const testCacheNotFoundError = async (continueOnCacheMiss: boolean) => {
    (mockConfig.values as CacheCommandConfig & CacheGetCommandConfig).continue =
      continueOnCacheMiss;
    const axiosError = { response: { status: 404 } };
    vi.mocked(isAxiosError).mockReturnValue(true);
    vi.mocked(retrieveCache).mockResolvedValueOnce(mockCacheResult);
    vi.mocked(download).mockRejectedValue(axiosError);

    if (continueOnCacheMiss) {
      await handleGetCache();
      expect(warnWithNoTrace).toHaveBeenCalledWith(
        `Cache with ID "${mockCacheResult.cacheId}" not found`
      );
    } else {
      await expect(handleGetCache()).rejects.toThrow(
        `Cache with ID "${mockCacheResult.cacheId}" not found`
      );
      expect(warnWithNoTrace).not.toHaveBeenCalled();
    }
  };

  it('should throw an error if cache is not found and continueOnCacheMiss is false', async () => {
    await testCacheNotFoundError(false);
  });

  it('should warn and return if cache is not found and continueOnCacheMiss is true', async () => {
    await testCacheNotFoundError(true);
  });

  it('should throw an unknown error if it is not an Axios error', async () => {
    const unknownError = new Error('Unknown error');
    vi.mocked(download).mockRejectedValue(unknownError);
    await expect(handleGetCache()).rejects.toThrow(unknownError);
  });
});
