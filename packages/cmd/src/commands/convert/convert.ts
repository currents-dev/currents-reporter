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

// Returns the directory of the converted reports.
export async function convertReports(options: ConvertCommandOpts) {
  setConvertCommandConfig(convertCommandOptsToConfig(options));
  debug('Config: %o', getConvertCommandConfig());

  return handleConvert();
}

export async function convertHandler(options: ConvertCommandOpts) {
  await commandHandler(async (opts) => {
    await convertReports(opts);
  }, options);
}
