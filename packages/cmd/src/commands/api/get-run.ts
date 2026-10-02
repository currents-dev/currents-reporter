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

type RunGetCommand = ReturnType<typeof getRunGetCommand>;

export async function getRunHandler(
  options: ReturnType<RunGetCommand['opts']>,
  command: RunGetCommand
) {
  await commandHandler(async (opts) => {
    // CURRENTS_CI_BUILD_ID is often set for a whole CI job. It must not turn
    // `run get --branch main` into an error for combining the two.
    const ciBuildIdFromEnv =
      command.getOptionValueSource('ciBuildId') === 'env';
    if (ciBuildIdFromEnv && (opts.branch || opts.tag)) {
      opts = { ...opts, ciBuildId: undefined };
    }
    setAPIGetRunCommandConfig(opts);
    const config = getAPIGetRunCommandConfig();

    debug('Config: %o', maskApiKey(config));
    await handleGetRun();
  }, options);
}
