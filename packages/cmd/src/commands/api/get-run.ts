import { debug as _debug } from '@debug';
import { getRunCommand } from '.';
import {
  getAPIGetRunCommandConfig,
  setAPIGetRunCommandConfig,
} from '../../config/api';
import { maskApiKey } from '../../lib';
import { handleGetRun } from '../../services';
import { bearerToken, getValidCredentials } from '../../services/auth';
import { commandHandler } from '../utils';

const debug = _debug.extend('cli');

export async function getRunHandler(
  options: ReturnType<ReturnType<typeof getRunCommand>['opts']>
) {
  await commandHandler(async (opts) => {
    // An explicit --api-key or CURRENTS_API_KEY wins over a stored login.
    if (!opts.apiKey) {
      const credentials = await getValidCredentials();
      if (credentials) {
        opts.apiKey = bearerToken(credentials);
      }
    }
    setAPIGetRunCommandConfig(opts);
    const config = getAPIGetRunCommandConfig();

    debug('Config: %o', maskApiKey(config));
    await handleGetRun();
  }, options);
}
