import { debug as _debug } from '@debug';
import { getRunCommand } from '.';
import {
  getAPIGetRunCommandConfig,
  setAPIGetRunCommandConfig,
} from '../../config/api';
import { handleGetRun } from '../../services';
import { commandHandler } from '../utils';

const debug = _debug.extend('cli');

export async function getRunHandler(
  options: ReturnType<ReturnType<typeof getRunCommand>['opts']>
) {
  await commandHandler(async (opts) => {
    setAPIGetRunCommandConfig(opts);
    const config = getAPIGetRunCommandConfig();

    debug('Config: %o', config);
    await handleGetRun();
  }, options);
}
