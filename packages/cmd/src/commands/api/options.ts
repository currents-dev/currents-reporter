import { Option } from '@commander-js/extra-typings';
import { configKeys } from '../../config/api';
import { getEnvironmentVariableName } from '../../config/utils';
import { parseCommaSeparatedList } from '../utils';

export const apiKeyOption = new Option(
  '--api-key <api-key>',
  'API key from Currents dashboard for authentication'
).env(getEnvironmentVariableName(configKeys, 'apiKey'));

export const outputOption = new Option(
  '-o, --output <path>',
  'write the JSON to this file instead of stdout'
).env(getEnvironmentVariableName(configKeys, 'output'));

export const ciBuildIdOption = new Option(
  '--ci-build-id <id>',
  'the CI build ID the run was recorded with; cannot be combined with --branch or --tag'
).env(getEnvironmentVariableName(configKeys, 'ciBuildId'));

export const projectOption = new Option(
  '-p, --project-id <project>',
  'Project ID from Currents associated with the run'
).env(getEnvironmentVariableName(configKeys, 'projectId'));

export const tagOption = new Option(
  '-t, --tag <tag>',
  'find the last run with these tags, comma-separated'
).argParser(parseCommaSeparatedList);

export const debugOption = new Option('--debug', 'Enable debug logging')
  .env(getEnvironmentVariableName(configKeys, 'debug'))
  .default(false);

export const branchOption = new Option(
  '-b, --branch <branch>',
  'find the last run of this git branch'
);

export const pwLastRunOption = new Option(
  '--pw-last-run',
  "output only the status and the failed tests of the run, in the format of Playwright's .last-run.json"
);
