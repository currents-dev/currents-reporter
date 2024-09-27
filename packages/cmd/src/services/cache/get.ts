import { debug, enableDebug } from "@debug";
import { isAxiosError } from "axios";
import { retrieveCache } from "../../api";
import { PRESETS } from "../../commands/cache/options";
import { getCacheCommandConfig } from "../../config/cache";
import { getCI } from "../../env/ciProvider";
import { warnWithNoTrace } from "../../logger";
import { unzipBuffer } from "./fs";
import { MetaFile, warn } from "./lib";
import { download } from "./network";
import { handlePostLastRunPreset, handlePreLastRunPreset } from "./presets";

export async function handleGetCache() {
  try {
    const config = getCacheCommandConfig();
    if (config.type !== "GET_COMMAND_CONFIG" || !config.values) {
      throw new Error("Config is missing!");
    }

    const { recordKey, id, preset, matrixIndex, matrixTotal } = config.values;
    const outputDir = config.values.outputDir;

    if (config.values.debug) {
      enableDebug();
    }

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
        if (e.response?.status && e.response?.status < 500) {
          warnWithNoTrace(`Cache with ID "${result.cacheId}" not found`);
          return;
        }
      }

      throw e;
    }
  } catch (e) {
    warn(e, "Failed to obtain cache");
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
  await unzipBuffer(buffer, outputDir || ".");
  debug("Cache downloaded");
}

async function handleMetaDownload(readUrl: string) {
  const buffer = await download(readUrl);
  const meta = JSON.parse(buffer.toString("utf-8")) as MetaFile;
  debug("Meta file: %O", meta);
  return meta;
}
