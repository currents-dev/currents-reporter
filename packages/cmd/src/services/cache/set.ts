import { debug } from '@debug';

import { omit } from 'lodash';
import { createCache } from '../../api';
import { PRESETS } from '../../commands/cache/options';
import { getCacheCommandConfig } from '../../config/cache';
import { getCI } from '../../env/ciProvider';
import { dim, info, success, warnWithNoTrace } from '../../logger';
import { zipFilesToBuffer } from './fs';
import { createMeta } from './lib';
import {
  ContentType,
  getDefautUploadProgressHandler,
  sendBuffer,
} from './network';
import { getLastRunFilePaths, getUploadPaths } from './path';

export async function handleSetCache() {
  const config = getCacheCommandConfig();
  if (config.type !== 'SET_COMMAND_CONFIG' || !config.values) {
    throw new Error('Config is missing!');
  }

  const {
    recordKey,
    id,
    preset,
    pwOutputDir,
    matrixIndex,
    matrixTotal,
    continue: continueOnNoUpload,
  } = config.values;

  const uploadPaths = await getUploadPaths(config.values.path);
  const configUploadPaths: (string | undefined)[] = config.values.path || [];
  const ci = getCI();

  if (preset === PRESETS.lastRun) {
    configUploadPaths.push(pwOutputDir);
    uploadPaths.push(...(await getLastRunFilePaths(pwOutputDir)));
  }

  if (uploadPaths.length === 0) {
    const message = `No files available to upload: ${configUploadPaths.filter(Boolean).join(',')}`;
    if (!continueOnNoUpload) {
      throw new Error(message);
    }
    warnWithNoTrace(message);
  }

  const result = await createCache({
    recordKey,
    ci,
    id,
    config: {
      matrixIndex,
      matrixTotal,
    },
  });
  debug('Cache upload url created', { result });

  const ciForMeta = getCIForMeta(ci);

  const archive =
    uploadPaths.length > 0 ? await zipFilesToBuffer(uploadPaths) : null;
  const uploads = [];

  if (archive) {
    uploads.push(
      handleArchiveUpload({
        archive,
        cacheId: result.cacheId,
        uploadUrl: result.uploadUrl,
      }).then(() => {
        logUploadPaths(uploadPaths);
        info('Cache archive uploaded', {
          uploadUrl: result.uploadUrl,
        });
      })
    );
  }

  uploads.push(
    handleMetaUpload({
      meta: createMeta({
        cacheId: result.cacheId,
        config: config.values,
        ci: ciForMeta,
        orgId: result.orgId,
        path: uploadPaths,
      }),
      cacheId: result.cacheId,
      uploadUrl: result.metaUploadUrl,
    }).then(() =>
      info('Meta uploaded', {
        uploadUrl: result.metaUploadUrl,
      })
    ),
    handleMetaUpload({
      meta: createMeta({
        cacheId: result.cacheId,
        config: config.values,
        ci: ciForMeta,
        orgId: result.orgId,
        path: uploadPaths,
        cacheKey: result.cacheKey,
        metaCacheKey: result.metaCacheKey,
      }),
      cacheId: result.cacheId,
      uploadUrl: result.refMetaUploadUrl,
    }).then(() =>
      info('Ref meta uploaded', {
        uploadUrl: result.refMetaUploadUrl,
      })
    )
  );

  await Promise.all(uploads);
  success('Cache uploaded. Cache ID: %s', result.cacheId);
}

async function handleArchiveUpload({
  archive,
  cacheId,
  uploadUrl,
}: {
  archive: Buffer;
  cacheId: string;
  uploadUrl: string;
}) {
  try {
    const contentType = ContentType.ZIP;
    await sendBuffer(
      {
        buffer: archive,
        contentType,
        name: cacheId,
        uploadUrl,
      },
      contentType,
      getDefautUploadProgressHandler(cacheId)
    );
    debug('Cache archive uploaded', { cacheId });
  } catch (error) {
    debug('Failed to upload cache archive', error);
    throw error;
  }
}

async function handleMetaUpload({
  meta,
  cacheId,
  uploadUrl,
}: {
  meta: Buffer;
  cacheId: string;
  uploadUrl: string;
}) {
  try {
    const name = `${cacheId}_meta`;
    const contentType = ContentType.JSON;
    await sendBuffer(
      {
        buffer: meta,
        contentType,
        name,
        uploadUrl,
      },
      contentType,
      getDefautUploadProgressHandler(name)
    );

    debug('Cache meta uploaded', { cacheId });
  } catch (error) {
    debug('Failed to upload cache meta', error);
    throw error;
  }
}

function getCIForMeta(ci: ReturnType<typeof getCI>) {
  // exclude ciBuildId from meta file if the source is server or random
  return ci.ciBuildId.source === 'server' || ci.ciBuildId.source === 'random'
    ? omit(ci, 'ciBuildId')
    : ci;
}

function logUploadPaths(paths: string[]) {
  info(
    `Cache upload paths:\n` +
      paths.map((path) => `${dim('- uploading')} ${path}`).join('\n')
  );
}
