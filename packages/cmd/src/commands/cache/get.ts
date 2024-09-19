import { debug as _debug } from "@debug";
import { getCacheGetCommand } from ".";
import {
  getCacheCommandConfig,
  setCacheCommandConfig,
} from "../../config/cache";
import { commandHandler } from "../utils";

const debug = _debug.extend("cli");

export async function getCacheGetHandler(
  options: ReturnType<ReturnType<typeof getCacheGetCommand>["opts"]>
) {
  await commandHandler(async (opts) => {
    setCacheCommandConfig(opts);
    const config = getCacheCommandConfig();

    debug("Config: %o", config);
  }, options);
}
