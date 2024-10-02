import { debug } from '@debug';
import { isAxiosError } from 'axios';
import { retrieveCache } from '../../api';
import { PRESETS } from '../../commands/cache/options';
import { getCacheCommandConfig } from '../../config/cache';
import { getCI } from '../../env/ciProvider';
import { Warning } from '../../lib';
import { unzipBuffer } from './fs';
import { MetaFile } from './lib';
import { download } from './network';
import { handlePostLastRunPreset, handlePreLastRunPreset } from './presets';

export async function handleGetCache() {
  const config = getCacheCommandConfig();
  if (config.type !== 'GET_COMMAND_CONFIG' || !config.values) {
    throw new Error('Config is missing!');
  }

  const { recordKey, id, preset, matrixIndex, matrixTotal } = config.values;
  const outputDir = config.values.outputDir;

  const ci = getCI();

  if (preset === PRESETS.lastRun) {
    await handlePreLastRunPreset(config.values, ci);
  }

  const result = await retrieveCache({
    recordKey,
    ci,
    id,
    config: {
      matrixIndex,
      matrixTotal,
    },
  });

  try {
    await handleArchiveDownload({
      readUrl: result.readUrl,
      outputDir,
    });

    const meta = await handleMetaDownload(result.metaReadUrl);

    if (preset === PRESETS.lastRun) {
      await handlePostLastRunPreset(config.values, ci, meta);
    }
  } catch (e) {
    if (isAxiosError(e)) {
      if (
        e.response?.status &&
        (e.response?.status === 403 || e.response?.status === 404)
      ) {
        throw new Warning(`Cache with ID "${result.cacheId}" not found`);
      }
    }

    throw e;
  }
}

async function handleArchiveDownload({
  readUrl,
  outputDir,
}: {
  readUrl: string;
  outputDir?: string;
}) {
  const buffer = await download(readUrl);
  await unzipBuffer(buffer, outputDir || '.');
  debug('Cache downloaded');
}

async function handleMetaDownload(readUrl: string) {
  const buffer = await download(readUrl);
  const meta = JSON.parse(buffer.toString('utf-8')) as MetaFile;
  debug('Meta file: %O', meta);
  return meta;
}
