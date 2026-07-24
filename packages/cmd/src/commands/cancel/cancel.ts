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
  await commandHandler(async (opts) => {
    setCancelCommandConfig(opts);
    const config = getCancelCommandConfig();

    debug('Config: %o', maskRecordKey(config ?? {}));
    await handleCancelRun();
  }, options);
}
