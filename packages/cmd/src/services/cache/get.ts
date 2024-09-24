import { debug, enableDebug } from "@debug";
import { retrieveCache } from "../../api";
import { PRESETS } from "../../commands/cache/options";
import { getCacheCommandConfig } from "../../config/cache";
import { getCI } from "../../env/ciProvider";
import { unzipBuffer } from "./fs";
import { MetaFile, warn } from "./lib";
import { download } from "./network";
import { handleLastRunPreset } from "./presets";

export async function handleGetCache() {
  try {
    const config = getCacheCommandConfig();
    if (config.type !== "GET_COMMAND_CONFIG" || !config.values) {
      throw new Error("Config is missing!");
    }

    const { recordKey, id, preset  } = config.values;
    const outputDir = config.values.outputDir ?? config.values.pwOutputDir;

    if (config.values.debug) {
      enableDebug();
    }

    const ci = getCI();

    if (preset === PRESETS.lastRun) {
      await handleLastRunPreset(config.values, ci);
    }

    const result = await retrieveCache({
      recordKey,
      ci,
      id,
    });

    await handleArchiveDownload({
      readUrl: result.readUrl,
      outputDir,
    });

    await handleMetaDownload(result.metaReadUrl);
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
  try {
    const buffer = await download(readUrl);
    await unzipBuffer(buffer, outputDir || '.');
    debug("Cache downloaded");
  } catch (error) {
    debug("Failed to recreate chache from archive");
    throw error;
  }
}

async function handleMetaDownload(readUrl: string) {
  try {
    const buffer = await download(readUrl);
    const meta = JSON.parse(buffer.toString("utf-8")) as MetaFile;
    console.log(meta);
    debug("Meta file: %O", meta);
  } catch (error) {
    debug("Failed to handle the meta");
    throw error;
  }
}
