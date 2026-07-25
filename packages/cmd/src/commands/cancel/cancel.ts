import { debug as _debug } from '@debug';
import { getCancelCommand } from '.';
import {
  getCancelCommandConfig,
  setCancelCommandConfig,
} from '../../config/cancel';
import { maskRecordKey } from '../../lib';
import { handleCancelRun } from '../../services';
import { commandHandler } from '../utils';

const debug = _debug.extend('cli');

export async function cancelHandler(
  options: ReturnType<ReturnType<typeof getCancelCommand>['opts']>
) {
  await commandHandler(async ({ key, ...opts }) => {
    // Commander names this option after its flag, the config calls it
    // recordKey. Undefined is dropped when the config is resolved, so
    // CURRENTS_RECORD_KEY still applies when the flag is absent.
    setCancelCommandConfig({ ...opts, recordKey: key });
    const config = getCancelCommandConfig();

    debug('Config: %o', maskRecordKey(config ?? {}));
    await handleCancelRun();
  }, options);
}
