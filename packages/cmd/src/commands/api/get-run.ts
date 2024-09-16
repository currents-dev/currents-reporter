import { info } from "@logger";
import { getRunCommand } from ".";
import {
  getAPIGetRunCommandConfig,
  setAPIGetRunCommandConfig,
} from "../../config/api";
import { handleGetRun } from "../../services";
import { commandHandler } from "../utils";

export async function getRunHandler(
  options: ReturnType<ReturnType<typeof getRunCommand>["opts"]>
) {
  await commandHandler(async (opts) => {
    setAPIGetRunCommandConfig(opts);
    const config = getAPIGetRunCommandConfig();

    info("Config: %o", config);
    await handleGetRun();
  }, options);
}
