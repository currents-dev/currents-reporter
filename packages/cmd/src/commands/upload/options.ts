import { Option } from '@commander-js/extra-typings';

import { configKeys } from '../../config/upload';
import { getEnvironmentVariableName } from '../../config/utils';
import { parseCommaSeparatedList } from '../utils';

export const ciBuildIdOption = new Option(
  '--ci-build-id <id>',
  'the CI build ID to record the run under; by default taken from the CI environment, or a random value'
).env(getEnvironmentVariableName(configKeys, 'ciBuildId'));

export const recordKeyOption = new Option(
  '-k, --key <record-key>',
  'your secret Record Key obtained from Currents'
).env(getEnvironmentVariableName(configKeys, 'recordKey'));

export const projectOption = new Option(
  '-p, --project-id <project>',
  'the project ID for results reporting obtained from Currents'
).env(getEnvironmentVariableName(configKeys, 'projectId'));

export const tagOption = new Option(
  '-t, --tag <tag>',
  'comma-separated tags to add to the run'
)
  .env(getEnvironmentVariableName(configKeys, 'tag'))
  .argParser(parseCommaSeparatedList);

export const removeTagOption = new Option(
  '--remove-title-tags',
  'remove tags from test names in Currents, e.g. `Test name @smoke` becomes `Test name` in the dashboard'
)
  .env(getEnvironmentVariableName(configKeys, 'removeTitleTags'))
  .default(false);

export const disableTitleTagsOption = new Option(
  '--disable-title-tags',
  'disable parsing tags from test title, e.g. `Test name @smoke` would not be tagged with `smoke` in the dashboard'
)
  .env(getEnvironmentVariableName(configKeys, 'disableTitleTags'))
  .default(false);

export const machineIdOption = new Option(
  '--machine-id <string>',
  'unique identifier of the machine running the tests. If not provided, it will be generated automatically. See: https://docs.currents.dev/?q=machineId'
).env(getEnvironmentVariableName(configKeys, 'machineId'));

export const reportDirOption = new Option(
  '--report-dir <string>',
  'the folder of the reports to upload; by default the newest folder in .currents'
).env(getEnvironmentVariableName(configKeys, 'reportDir'));

export const debugOption = new Option('--debug', 'enable debug logs')
  .env(getEnvironmentVariableName(configKeys, 'debug'))
  .default(false);
