import { debug as _debug } from '@debug';
import { getRunGetCommand } from '.';
import {
  getAPIGetRunCommandConfig,
  setAPIGetRunCommandConfig,
} from '../../config/api';
import { maskKeys } from '../../lib';
import { handleGetRun } from '../../services';
import { commandHandler, printLogsToStderr } from '../utils';
import { withResolvedApiKey } from './request';

const debug = _debug.extend('cli');

type RunGetCommand = ReturnType<typeof getRunGetCommand>;

export async function getRunHandler(
  options: ReturnType<RunGetCommand['opts']>,
  command: RunGetCommand
) {
  await commandHandler(async (opts) => {
    if (!opts.output) {
      printLogsToStderr();
    }
    // CURRENTS_CI_BUILD_ID is often set for a whole CI job. It must not turn
    // `run get --branch main` into an error for combining the two.
    const ciBuildIdFromEnv =
      command.getOptionValueSource('ciBuildId') === 'env';
    if (ciBuildIdFromEnv && (opts.branch || opts.tag)) {
      opts = { ...opts, ciBuildId: undefined };
    }
    await withResolvedApiKey(
      opts.apiKey,
      command.getOptionValueSource('apiKey'),
      async (apiKey) => {
        setAPIGetRunCommandConfig({ ...opts, apiKey });
        debug('Config: %o', maskKeys(getAPIGetRunCommandConfig()));
        await handleGetRun();
      }
    );
  }, options);
}
