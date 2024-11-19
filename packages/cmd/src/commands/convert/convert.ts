import { debug as _debug } from '@debug';
import { getConvertCommand } from '.';
import { commandHandler } from '../../commands/utils';
import {
  convertCommandOptsToConfig,
  getConvertCommandConfig,
  setConvertCommandConfig,
} from '../../config/convert';
import { handleConvert } from '../../services/convert';

const debug = _debug.extend('cli');

export type ConvertCommandOpts = ReturnType<
  ReturnType<typeof getConvertCommand>['opts']
>;

export async function convertHandler(options: ConvertCommandOpts) {
  await commandHandler(async (opts) => {
    setConvertCommandConfig(convertCommandOptsToConfig(opts));
    const config = getConvertCommandConfig();

    debug('Config: %o', config);

    await handleConvert();
  }, options);
}
