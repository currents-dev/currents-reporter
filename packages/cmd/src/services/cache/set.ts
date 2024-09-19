import { debug, enableDebug } from "@debug";
import { getCacheCommandConfig } from "../../config/cache";

export async function handleSetCache() {
  try {
    const config = getCacheCommandConfig();
    if (!config) {
      throw new Error("Config is missing!");
    }

    if (config.debug) {
      enableDebug();
    }
  } catch (e) {
    debug("Failed to set cache");
    throw e;
  }
}
