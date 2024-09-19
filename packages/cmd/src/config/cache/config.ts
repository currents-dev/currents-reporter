import { debug as _debug } from "@debug";

import { getValidatedConfig } from "../utils";
import { configKeys, getEnvVariables } from "./env";

const debug = _debug.extend("config");

export type CacheCommandConfig = {
  /**
   * The record key to be used to record the results on the remote dashboard. Read more: https://currents.dev/readme/guides/record-key
   */
  recordKey: string;

  /**
   * Enable or disable debug logging.
   */
  debug?: boolean;
};

type CommonConfig = {
  id?: string;
  preset?: string;
};

export type CacheSetCommandConfig = CommonConfig & {
  paths?: string[];
};

export type CacheGetCommandConfig = CommonConfig & {
  outputDir?: string;
};

type MandatoryCacheCommandKeys = "recordKey";

const mandatoryConfigKeys: MandatoryCacheCommandKeys[] = ["recordKey"];

let _config:
  | (CacheCommandConfig & CacheSetCommandConfig)
  | (CacheCommandConfig & CacheGetCommandConfig)
  | null = null;

export function setCacheCommandConfig(
  options?: Partial<NonNullable<typeof _config>>
) {
  _config = getValidatedConfig(
    configKeys,
    mandatoryConfigKeys,
    getEnvVariables,
    options
  );
  debug("Resolved config: %o", _config);
}

export function getCacheCommandConfig() {
  return _config;
}
