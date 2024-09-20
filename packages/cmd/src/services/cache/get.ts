import { debug, enableDebug } from "@debug";
import { retrieveCache } from "../../api";
import { getCacheCommandConfig } from "../../config/cache";
import { getCI } from "../../env/ciProvider";
import { unzipBuffer, writeUnzippedFilesToDisk } from "./fs";
import { MetaFile } from "./lib";
import { download } from "./network";

export async function handleGetCache() {
  try {
    const config = getCacheCommandConfig();
    if (config.type !== "GET_COMMAND_CONFIG" || !config.values) {
      throw new Error("Config is missing!");
    }

    const { recordKey, id, outputDir } = config.values;

    if (config.values.debug) {
      enableDebug();
    }

    const ci = getCI();
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
    debug("Failed to obtain cache");
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
  try {
    const buffer = await download(readUrl);
    const unzipped = await unzipBuffer(buffer);

    await writeUnzippedFilesToDisk(unzipped, outputDir);
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
