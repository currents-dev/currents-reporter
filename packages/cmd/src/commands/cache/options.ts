import { InvalidArgumentError, Option } from '@commander-js/extra-typings';
import { configKeys } from '../../config/cache';
import { getEnvironmentVariableName } from '../../config/utils';
import { parseCommaSeparatedList } from '../utils';

export const recordKeyOption = new Option(
  '-k, --key <record-key>',
  'Your secret Record Key obtained from Currents'
).env(getEnvironmentVariableName(configKeys, 'recordKey'));

export const debugOption = new Option('--debug', 'Enable debug logging')
  .env(getEnvironmentVariableName(configKeys, 'debug'))
  .default(false);

export const idOption = new Option(
  '--id <id>',
  'The ID the data is saved under in the cache'
);

export const pathOption = new Option(
  '--path <path>',
  'comma-separated paths or glob patterns of the files to save; quote globs, e.g. "dist/**/*"'
).argParser(parseCommaSeparatedList);

export enum PRESETS {
  lastRun = 'last-run',
}

export const presetSetOption = new Option(
  '--preset <preset-name>',
  '"last-run" saves the Playwright .last-run.json files of --pw-output-dir, to rerun only the failed tests'
).choices(Object.values(PRESETS));

export const presetGetOption = new Option(
  '--preset <preset-name>',
  '"last-run" restores the saved .last-run.json files and writes the Playwright options for the rerun to --preset-output (GitHub Actions, GitLab and CircleCI)'
).choices(Object.values(PRESETS));

export const outputDirOption = new Option(
  '--output-dir <dir>',
  'the folder to restore the files to; by default the current folder'
);

export const pwOutputDirOption = new Option(
  '--pw-output-dir <dir>',
  'the Playwright output folder that holds .last-run.json'
).default('test-results');

export const PRESET_OUTPUT_PATH = '.currents_env';
export const presetOutputOption = new Option(
  '--preset-output <path>',
  'the file the "last-run" preset writes the Playwright options to'
).default(PRESET_OUTPUT_PATH);

export const matrixIndexOption = new Option(
  '--matrix-index <number>',
  'the index of this CI job in the matrix, from 1; each job has its own cache'
)
  .default(1)
  .argParser(validatePositiveInteger);

export const matrixTotalOption = new Option(
  '--matrix-total <number>',
  'the number of CI jobs in the matrix'
)
  .default(1)
  .argParser(validatePositiveInteger);

function validatePositiveInteger(value: string) {
  const parsedValue = parseInt(value, 10);
  if (
    isNaN(parsedValue) ||
    parsedValue <= 0 ||
    !Number.isInteger(parsedValue)
  ) {
    throw new InvalidArgumentError('A positive integer is expected.');
  }
  return parsedValue;
}

export const continueGetOption = new Option(
  '--continue',
  'exit with 0 when the cache is not found'
).default(false);

export const continueSetOption = new Option(
  '--continue',
  'exit with 0 when no files are found, and save the cache without files'
).default(false);
