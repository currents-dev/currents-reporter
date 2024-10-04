import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createCache } from '../../../api';
import { PRESETS } from '../../../commands/cache/options';
import {
  CacheCommandConfig,
  CacheSetCommandConfig,
  getCacheCommandConfig,
} from '../../../config/cache';
import { getCI } from '../../../env/ciProvider';
import { success } from '../../../logger';
import { filterPaths, zipFilesToBuffer } from '../fs';
import { createMeta, getLastRunFilePath } from '../lib';
import { sendBuffer } from '../network';
import { handleSetCache } from '../set';

vi.mock('../../../config/cache');
vi.mock('../../../env/ciProvider');
vi.mock('../../../api');
vi.mock('../../../logger');
vi.mock('../fs');
vi.mock('../lib');
vi.mock('../network');

describe('handleSetCache', () => {
  const mockConfig: {
    type: 'SET_COMMAND_CONFIG';
    values: CacheCommandConfig & CacheSetCommandConfig;
  } = {
    type: 'SET_COMMAND_CONFIG',
    values: {
      recordKey: 'testKey',
      id: 'testId',
      preset: PRESETS.lastRun,
      pwOutputDir: 'outputDir',
      matrixIndex: 0,
      matrixTotal: 1,
      path: ['file1', 'file2'],
    },
  };

  const mockCI: ReturnType<typeof getCI> = {
    provider: 'testCI',
    ciBuildId: { source: 'random', value: 'auto-ci-build-id' },
    params: {},
  };

  const mockCreateCacheResult = {
    cacheId: 'cacheId123',
    uploadUrl: 'http://upload.url',
    metaUploadUrl: 'http://meta.url',
    orgId: 'org123',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCacheCommandConfig).mockReturnValue(mockConfig);
    vi.mocked(getCI).mockReturnValue(mockCI);
    vi.mocked(createCache).mockResolvedValue(mockCreateCacheResult);
    vi.mocked(zipFilesToBuffer).mockResolvedValue(Buffer.from('zip archive'));
    vi.mocked(createMeta).mockReturnValue(Buffer.from('meta data'));
    vi.mocked(getLastRunFilePath).mockReturnValue('.last-run.json');
  });

  it('should throw an error if config type is not SET_COMMAND_CONFIG', async () => {
    vi.mocked(getCacheCommandConfig).mockReturnValue({
      type: 'GET_COMMAND_CONFIG',
      values: mockConfig.values,
    });
    await expect(handleSetCache()).rejects.toThrow('Config is missing!');
  });

  it('should throw an error if config values are not set', async () => {
    vi.mocked(getCacheCommandConfig).mockReturnValue({
      type: 'GET_COMMAND_CONFIG',
      values: null,
    });
    await expect(handleSetCache()).rejects.toThrow('Config is missing!');
  });

  it('should throw an error if no paths available to upload', async () => {
    vi.mocked(getCacheCommandConfig).mockReturnValue({
      ...mockConfig,
      values: { ...mockConfig.values, preset: undefined, path: [] },
    });
    await expect(handleSetCache()).rejects.toThrow(
      'No paths available to upload'
    );
  });

  it('should call filterPaths and zipFilesToBuffer', async () => {
    await handleSetCache();
    expect(filterPaths).toHaveBeenCalledWith(mockConfig.values.path);
    expect(zipFilesToBuffer).toHaveBeenCalledWith(['.last-run.json']);
  });

  it('should upload cache archive and meta data', async () => {
    await handleSetCache();

    expect(createCache).toHaveBeenCalledWith({
      recordKey: 'testKey',
      ci: mockCI,
      id: 'testId',
      config: { matrixIndex: 0, matrixTotal: 1 },
    });

    expect(sendBuffer).toHaveBeenCalledWith(
      {
        buffer: Buffer.from('zip archive'),
        contentType: 'application/zip',
        name: 'cacheId123',
        uploadUrl: 'http://upload.url',
      },
      'application/zip',
      undefined
    );

    expect(sendBuffer).toHaveBeenCalledWith(
      {
        buffer: Buffer.from('meta data'),
        contentType: 'application/json',
        name: 'cacheId123_meta',
        uploadUrl: 'http://meta.url',
      },
      'application/json',
      undefined
    );
  });

  it('should log success message when cache is uploaded', async () => {
    await handleSetCache();
    expect(success).toHaveBeenCalledWith(
      'Cache uploaded. Cache ID: %s',
      'cacheId123'
    );
  });

  it('should call getLastRunFilePath if preset is lastRun', async () => {
    await handleSetCache();
    expect(getLastRunFilePath).toHaveBeenCalledWith('outputDir');
  });

  it('should throw error if handleArchiveUpload fails', async () => {
    vi.mocked(zipFilesToBuffer).mockRejectedValue(
      new Error('Failed to zip files')
    );
    await expect(handleSetCache()).rejects.toThrow('Failed to zip files');
  });

  it('should throw error if handleMetaUpload fails', async () => {
    vi.mocked(sendBuffer).mockRejectedValue(new Error('Failed to uplaod'));
    await expect(handleSetCache()).rejects.toThrow('Failed to uplaod');
  });
});
