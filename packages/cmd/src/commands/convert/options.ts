import { InvalidArgumentError, Option } from '@commander-js/extra-typings';
import * as globby from 'globby';

export enum REPORT_INPUT_FORMATS {
  junit = 'junit',
}
export const inputFormatOption = (note?: string) =>
  new Option(
    '--input-format <format>',
    ['the format of the reports to convert', note].filter(Boolean).join(' ')
  ).choices(Object.values(REPORT_INPUT_FORMATS));

export const inputFileOption = (note: string) =>
  new Option(
    '--input-file <patterns>',
    `comma-separated glob patterns of the report files, e.g. "reports/*.xml,other.xml"; quote them so that the shell does not expand them ${note}`
  ).argParser(validateGlobPattern);

export const outputDirOption = new Option(
  '-o, --output-dir <folder>',
  'the folder to save the converted reports to; it must be empty or not exist'
);

export enum REPORT_FRAMEWORKS {
  postman = 'postman',
  node = 'node',
  vitest = 'vitest',
  wdio = 'wdio',
}
export const frameworkOption = (note: string) =>
  new Option(
    '--framework <framework>',
    `the test framework that wrote the reports ${note}`
  ).choices(Object.values(REPORT_FRAMEWORKS));

export const frameworkVersionOption = new Option(
  '--framework-version <version>',
  'the version of the test framework that wrote the reports'
);

function validateGlobPattern(value: string) {
  const patterns = value.split(',').map((pattern) => pattern.trim());

  const allResults = globby.sync(patterns);

  if (allResults.length === 0) {
    throw new InvalidArgumentError('No files found with the provided patterns');
  }

  return allResults;
}
