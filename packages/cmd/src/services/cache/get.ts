import { isAxiosError } from 'axios';
import path from 'path';
import { getRefCacheMeta, retrieveCache } from '../../api';
import { PRESETS } from '../../commands/cache/options';
import { getCacheCommandConfig } from '../../config/cache';
import { getCI } from '../../env/ciProvider';
import { dim, info, success, warnWithNoTrace } from '../../logger';
import { unzipBuffer } from './fs';
import { RefMetaFile } from './lib';
import { download } from './network';
import { handlePostLastRunPreset, handlePreLastRunPreset } from './presets';

export async function handleGetCache() {
  const config = getCacheCommandConfig();
  if (config.type !== 'GET_COMMAND_CONFIG' || !config.values) {
    throw new Error('Config is missing!');
  }

  const {
    recordKey,
    id,
    preset,
    matrixIndex,
    matrixTotal,
    continue: continueOnCacheMiss,
  } = config.values;
  const outputDir = config.values.outputDir;

  const ci = getCI();

  if (preset === PRESETS.lastRun) {
    await handlePreLastRunPreset(config.values, ci);
  }

  const { cacheId, refMetaReadUrl } = await getRefCacheMeta({
    recordKey,
    ci,
    id,
    config: {
      matrixIndex,
      matrixTotal,
    },
  });

  try {
    const meta = await handleMetaDownload(refMetaReadUrl);

    const { readUrl } = await retrieveCache({
      recordKey,
      cacheKey: meta.cacheKey,
    });

    const destination = await handleArchiveDownload({
      readUrl,
      outputDir,
    });

    if (preset === PRESETS.lastRun) {
      await handlePostLastRunPreset(config.values, ci, meta);
    }

    info(dim('- restoring cache to'), destination);
    success('Cache restored. Cache ID: %s', cacheId);
  } catch (e) {
    if (isAxiosError(e)) {
      if (e.response?.status === 403 || e.response?.status === 404) {
        const message = `Cache with ID "${cacheId}" not found`;
        if (continueOnCacheMiss) {
          warnWithNoTrace(message);
          return;
        }

        throw new Error(message);
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
  const destination = getOutputDir(outputDir);

  await unzipBuffer(buffer, destination);

  debug('Cache downloaded', { readUrl, destination });
  return destination;
}

function getOutputDir(outputDir: string | undefined) {
  const _outputDir = outputDir ?? process.cwd();
  return path.isAbsolute(_outputDir)
    ? _outputDir
    : path.resolve(process.cwd(), _outputDir);
}

async function handleMetaDownload(readUrl: string) {
  const buffer = await download(readUrl);
  const meta = JSON.parse(buffer.toString('utf-8')) as RefMetaFile;
  debug('Meta file downloaded: %O', meta);
  return meta;
}
