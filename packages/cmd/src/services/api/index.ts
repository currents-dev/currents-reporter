import { AxiosError } from "axios";
import { getRun } from "../../api/get-run";
import { getAPIGetRunCommandConfig } from "../../config/api";
import { enableDebug } from "../../debug";
import { error } from "../../logger";

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
          lastFailed: config.lastFailed,
        }
      : {
          projectId: config.projectId,
          branch: config.branch,
          tag: config.tag,
          lastFailed: config.lastFailed,
        };

    const result = await getRun(config.apiKey, params);

    if (config.lastFailed) {
      console.log(getLastRunObject(result.data));
      return;
    }

    console.log(JSON.stringify(result));
  } catch (e) {
    if (e instanceof AxiosError) {
      return;
    }

    throw new Error("Failed to get run data");
  }
}

function getLastRunObject(result: unknown): string {
  return JSON.stringify(result, null, 2);
}
