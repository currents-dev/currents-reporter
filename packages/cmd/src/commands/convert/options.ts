import { InvalidArgumentError, Option } from '@commander-js/extra-typings';
import { globbySync } from 'globby';
import { configKeys } from '../../config/convert';
import { getEnvironmentVariableName } from '../../config/utils';

export const debugOption = new Option('--debug', 'Enable debug logging')
  .env(getEnvironmentVariableName(configKeys, 'debug'))
  .default(false);

export enum REPORT_INPUT_FORMATS {
  junit = 'junit',
}
export const inputFormatOption = new Option(
  '--input-format <string>',
  'the format of the input test reports'
).choices(Object.values(REPORT_INPUT_FORMATS));

export const inputFileOption = new Option(
  '--input-file <patterns>',
  'comma-separated glob patterns to match report file paths (e.g., "report1.xml,report2.xml")'
).argParser(validateGlobPattern);

export const outputDirOption = new Option(
  '-o, --output-dir <string>',
  'the directory to save the converted test reports'
);

export enum REPORT_FRAMEWORKS {
  postman = 'postman',
  node = 'node',
  vitest = 'vitest',
  wdio = 'wdio',
}
export const frameworkOption = new Option(
  '--framework <string>',
  'the testing framework used to generate the test reports'
).choices(Object.values(REPORT_FRAMEWORKS));

export const frameworkVersionOption = new Option(
  '--framework-version <string>',
  'the version of the testing framework used to generate the test reports'
);

function validateGlobPattern(value: string) {
  const patterns = value.split(',').map((pattern) => pattern.trim());

  const allResults = globbySync(patterns);

  if (allResults.length === 0) {
    throw new InvalidArgumentError('No files found with the provided patterns');
  }

  return allResults;
}
