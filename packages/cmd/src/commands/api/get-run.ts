import { debug as _debug } from '@debug';
import { getRunGetCommand } from '.';
import {
  getAPIGetRunCommandConfig,
  setAPIGetRunCommandConfig,
} from '../../config/api';
import { maskApiKey } from '../../lib';
import { handleGetRun } from '../../services';
import { commandHandler } from '../utils';

const debug = _debug.extend('cli');

export async function getRunHandler(
  options: ReturnType<ReturnType<typeof getRunGetCommand>['opts']>
) {
  await commandHandler(async (opts) => {
    setAPIGetRunCommandConfig(opts);
    const config = getAPIGetRunCommandConfig();

    debug('Config: %o', maskApiKey(config));
    await handleGetRun();
  }, options);
}
