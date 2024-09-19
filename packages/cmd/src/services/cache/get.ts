import { debug, enableDebug } from "@debug";
import { getCacheCommandConfig } from "../../config/cache";

export async function handleGetCache() {
  try {
    const config = getCacheCommandConfig();
    if (!config) {
      throw new Error("Config is missing!");
    }

    if (config.debug) {
      enableDebug();
    }
  } catch (e) {
    debug("Failed to get cache");
    throw e;
  }
}
