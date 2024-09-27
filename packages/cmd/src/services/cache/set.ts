import { debug, enableDebug } from "@debug";
import { omit } from "lodash";
import { createCache } from "../../api";
import { PRESETS } from "../../commands/cache/options";
import { getCacheCommandConfig } from "../../config/cache";
import { getCI } from "../../env/ciProvider";
import { filterPaths, zipFilesToBuffer } from "./fs";
import { createMeta, getLastRunFilePath, warn } from "./lib";
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

    const { recordKey, id, debug, preset, pwOutputDir } = config.values;

    if (debug) {
      enableDebug();
    }

    const paths = config.values.paths ? filterPaths(config.values.paths) : [];

    const uploadPaths: string[] = [];

    if (paths && paths.length > 0) {
      uploadPaths.push(...paths);
    }

    const ci = getCI();

    if (preset === PRESETS.lastRun) {
      const lastRunPath = getLastRunFilePath(pwOutputDir);
      uploadPaths.push(lastRunPath);
    }

    if (uploadPaths.length === 0) {
      throw new Error("No paths available to upload");
    }

    const result = await createCache({
      recordKey,
      ci,
      id,
    });

    await handleArchiveUpload({
      archive: await zipFilesToBuffer(uploadPaths),
      cacheId: result.cacheId,
      uploadUrl: result.uploadUrl,
    });

    await handleMetaUpload({
      meta: createMeta({
        cacheId: result.cacheId,
        config: omit(config.values, ["recordKey"]),
        ci,
        orgId: result.orgId,
        paths: uploadPaths,
      }),
      cacheId: result.cacheId,
      uploadUrl: result.metaUploadUrl,
    });
  } catch (e) {
    warn(e, "Failed to save cache");
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
