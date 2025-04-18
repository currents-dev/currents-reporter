import { CacheGetCommandOpts } from '../../commands/cache/get';
import { CacheSetCommandOpts } from '../../commands/cache/set';
import { CacheGetCommandConfig, CacheSetCommandConfig } from './config';

export function cacheGetCommandOptsToConfig(
  options: CacheGetCommandOpts
): Partial<CacheGetCommandConfig> {
  return {
    recordKey: options.key,
    id: options.id,
    preset: options.preset,
    outputDir: options.outputDir,
    presetOutput: options.presetOutput,
    debug: options.debug,
    matrixIndex: options.matrixIndex,
    matrixTotal: options.matrixTotal,
    continue: options.continue,
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
    path: options.path,
    debug: options.debug,
    matrixIndex: options.matrixIndex,
    matrixTotal: options.matrixTotal,
    continue: options.continue,
    saveToHistory: options.saveToHistory,
  };
}
