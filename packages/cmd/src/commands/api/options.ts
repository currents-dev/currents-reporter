import { Option } from '@commander-js/extra-typings';
import { configKeys } from '../../config/api';
import { getEnvironmentVariableName } from '../../config/utils';
import { recordedCiBuildIdOption, tagOption } from '../options';

export const outputOption = new Option(
  '-o, --output <path>',
  'write the JSON to this file instead of stdout'
).env(getEnvironmentVariableName(configKeys, 'output'));

export const ciBuildIdOption = recordedCiBuildIdOption(
  '; cannot be combined with --branch or --tag. The environment variable is ignored when --branch or --tag is set'
);

export const runTagOption = tagOption('find the last run with these tags');

export const branchOption = new Option(
  '-b, --branch <branch>',
  'find the last run of this git branch'
);

export const pwLastRunOption = new Option(
  '--pw-last-run',
  "print only the status and the failed tests of the run, in the format of Playwright's .last-run.json"
);
