import { debug, enableDebug } from "@debug";
import { ensurePathExists } from "@lib";
import { writeFile } from "fs/promises";
import { getRun } from "../../api/get-run";
import {
  APICommandConfig,
  APIGetRunCommandConfig,
  getAPIGetRunCommandConfig,
} from "../../config/api";
import { info } from "../../logger";

export async function handleGetRun() {
  try {
    const config = getAPIGetRunCommandConfig();
    if (!config) {
      throw new Error("Config is missing!");
    }

    if (config.debug) {
      enableDebug();
    }

    const params = config.ciBuildId
      ? {
          ciBuildId: config.ciBuildId,
          pwLastFailed: config.pwLastFailed,
        }
      : {
          projectId: config.projectId,
          branch: config.branch,
          tag: config.tag,
          pwLastFailed: config.pwLastFailed,
        };

    const result = await getRun(config.apiKey, params);
    await handleOutput(result.data, config);
  } catch (e) {
    debug("Failed to get run data");
    throw e;
  }
}

async function handleOutput(
  result: unknown,
  config: APICommandConfig & APIGetRunCommandConfig
) {
  const data = JSON.stringify(result, null, 2);

  if (config.output) {
    await ensurePathExists(config.output);
    await writeFile(config.output, data, "utf-8");
  } else {
    info(data);
  }
}
