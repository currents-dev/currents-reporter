import { debug, enableDebug } from "@debug";
import { createCache } from "../../api";
import { PRESETS } from "../../commands/cache/options";
import { getCacheCommandConfig } from "../../config/cache";
import { getCI } from "../../env/ciProvider";
import { zipFilesToBuffer } from "./fs";
import { createMeta, getLastRunFilePath } from "./lib";
import {
  ContentType,
  getDefautUploadProgressHandler,
  sendBuffer,
} from "./network";

export async function handleSetCache() {
  try {
    const config = getCacheCommandConfig();
    if (config.type !== "SET_COMMAND_CONFIG" || !config.values) {
      throw new Error("Config is missing!");
    }

    const { recordKey, id, paths, debug, preset, includeHidden } =
      config.values;

    if (debug) {
      enableDebug();
    }

    const ci = getCI();
    const result = await createCache({
      recordKey,
      ci,
      id,
    });

    const uploadPaths: string[] = [];

    if (paths && paths.length > 0) {
      uploadPaths.push(...paths);
    } else if (
      preset === PRESETS.lastFailedSharding ||
      preset === PRESETS.lastFailedOr8n
    ) {
      const lastRunPath = getLastRunFilePath();
      uploadPaths.push(lastRunPath);
    }

    await handleArchiveUpload({
      archive: await zipFilesToBuffer(uploadPaths, { includeHidden }),
      cacheId: result.cacheId,
      uploadUrl: result.uploadUrl,
    });

    await handleMetaUpload({
      meta: createMeta({
        cacheId: result.cacheId,
        config: config.values,
        ci,
        orgId: result.orgId,
        paths: uploadPaths,
      }),
      cacheId: result.cacheId,
      uploadUrl: result.metaUploadUrl,
    });
  } catch (e) {
    debug("Failed to save cache");
    throw e;
  }
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
    debug("Cache archive uploaded", { cacheId });
  } catch (error) {
    debug("Failed to upload cache archive", error);
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

    debug("Cache meta uploaded", { cacheId });
  } catch (error) {
    debug("Failed to upload cache meta", error);
    throw error;
  }
}
