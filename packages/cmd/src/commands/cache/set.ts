import { debug as _debug } from "@debug";
import { getCacheSetCommand } from ".";
import {
  cacheSetCommandOptsToConfig,
  getCacheCommandConfig,
  setCacheSetCommandConfig,
} from "../../config/cache";
import { handleSetCache } from "../../services";
import { commandHandler } from "../utils";

const debug = _debug.extend("cli");

export type CacheSetCommandOpts = ReturnType<
  ReturnType<typeof getCacheSetCommand>["opts"]
>;

export async function getCacheSetHandler(options: CacheSetCommandOpts) {
  await commandHandler(async (opts) => {
    setCacheSetCommandConfig(cacheSetCommandOptsToConfig(opts));
    const config = getCacheCommandConfig();

    debug("Config: %o", {
      ...config.values,
      recordKey: config.values?.recordKey ? "*****" : undefined,
    });

    await handleSetCache();
  }, options);
}
