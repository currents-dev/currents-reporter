import { debug as _debug } from '@debug';
import { getCacheGetCommand } from '.';
import {
  cacheGetCommandOptsToConfig,
  getCacheCommandConfig,
  setCacheGetCommandConfig,
} from '../../config/cache';
import { maskRecordKey } from '../../lib';
import { handleGetCache } from '../../services';
import { commandHandler } from '../utils';

const debug = _debug.extend('cli');

export type CacheGetCommandOpts = ReturnType<
  ReturnType<typeof getCacheGetCommand>['opts']
>;

export async function getCacheGetHandler(options: CacheGetCommandOpts) {
  await commandHandler(async (opts) => {
    setCacheGetCommandConfig(cacheGetCommandOptsToConfig(opts));
    const config = getCacheCommandConfig();

    debug('Config: %o', maskRecordKey(config.values));

    await handleGetCache();
  }, options);
}
