import { info } from '@logger';
import { resolve } from 'path';
import { getUploadCommand } from '.';

import { getCurrentsConfig, setCurrentsConfig } from '../../config/upload';
import { maskKeys } from '../../lib';
import { handleCurrentsReport } from '../../services';
import { convertReports } from '../convert/convert';
import { commandHandler } from '../utils';
import { CLIManager } from './cli-config';

type UploadCommandOpts = ReturnType<
  ReturnType<typeof getUploadCommand>['opts']
>;

export async function uploadHandler(options: UploadCommandOpts) {
  await commandHandler(async (opts) => {
    const reportDir = opts.inputFormat
      ? await convertBeforeUpload(opts)
      : opts.reportDir;

    const cliManager = new CLIManager({ ...opts, reportDir });
    setCurrentsConfig(cliManager.parsedConfig);
    const config = getCurrentsConfig();

    info('Currents config: %o', maskKeys(config));

    await handleCurrentsReport();
  }, options);
}

// Returns the directory of the converted reports, for the upload to read.
async function convertBeforeUpload({
  inputFormat,
  inputFile,
  framework,
  frameworkVersion,
  outputDir,
  reportDir,
  debug,
}: UploadCommandOpts) {
  if (outputDir && reportDir && resolve(outputDir) !== resolve(reportDir)) {
    throw new Error(
      '--output-dir and --report-dir name different folders. With --input-format, the converted reports are saved to one folder and uploaded from it: pass one of the two options.'
    );
  }
  return convertReports({
    inputFormat,
    inputFile,
    framework,
    frameworkVersion,
    outputDir: outputDir ?? reportDir,
    debug,
  });
}
