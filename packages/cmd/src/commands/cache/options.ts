import { InvalidArgumentError, Option } from '@commander-js/extra-typings';
import { parseCommaSeparatedList } from '../utils';

const DEFAULT_ID =
  'Without it the ID comes from the CI job: on GitHub Actions the repository, the run ID and --matrix-index; on GitLab the pipeline ID and the job name; on other CI the variables that identify the pipeline and the job, and --matrix-index. When no CI job is detected the ID is random, so pass --id';

export const idSetOption = new Option(
  '--id <id>',
  `the ID to save the files under. ${DEFAULT_ID}`
);

export const idGetOption = new Option(
  '--id <id>',
  `the ID the files were saved under. ${DEFAULT_ID}`
);

export const pathOption = new Option(
  '--path <path>',
  'comma-separated paths or glob patterns of the files to save, inside the current folder; quote globs, e.g. "dist/**/*". At most 50 MB zipped'
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
  '"last-run" restores the saved .last-run.json files and writes the Playwright options for the rerun to --preset-output'
).choices(Object.values(PRESETS));

export const outputDirOption = new Option(
  '--output-dir <folder>',
  'the folder to restore the files to; by default the current folder'
);

export const pwOutputDirOption = new Option(
  '--pw-output-dir <folder>',
  'the Playwright output folder that holds .last-run.json'
).default('test-results');

export const PRESET_OUTPUT_PATH = '.currents_env';
export const presetOutputOption = new Option(
  '--preset-output <path>',
  'the file the "last-run" preset writes, relative to the current folder. On GitHub Actions and CircleCI it holds options for "playwright test"; on GitLab the shell variables EXTRA_PW_FLAGS, EXTRA_PWCP_FLAGS and RUN_ATTEMPT, to source. Nothing is written on other CI'
).default(PRESET_OUTPUT_PATH);

export const matrixIndexOption = new Option(
  '--matrix-index <number>',
  'the index of this job among parallel jobs, from 1; each job has its own cache. Pass it when the CI does not tell the jobs apart, as in a GitHub Actions matrix'
)
  .default(1)
  .argParser(validatePositiveInteger);

export const matrixTotalOption = new Option(
  '--matrix-total <number>',
  'GitHub Actions only: the number of jobs in the matrix, for the shards that the last-run preset writes'
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
