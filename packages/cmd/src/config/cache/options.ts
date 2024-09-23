import { CacheGetCommandOpts } from "../../commands/cache/get";
import { CacheSetCommandOpts } from "../../commands/cache/set";
import { CacheGetCommandConfig, CacheSetCommandConfig } from "./config";

export function cacheGetCommandOptsToConfig(
  options: CacheGetCommandOpts
): Partial<CacheGetCommandConfig> {
  return {
    recordKey: options.key,
    id: options.id,
    preset: options.preset,
    outputDir: options.outputDir,
    debug: options.debug,
  };
}

export function cacheSetCommandOptsToConfig(
  options: CacheSetCommandOpts
): Partial<CacheSetCommandConfig> {
  return {
    recordKey: options.key,
    id: options.id,
    preset: options.preset,
    pwOutputDir: options.pwOutputDir,
    paths: options.paths,
    includeHidden: options.includeHidden,
    debug: options.debug,
  };
}
