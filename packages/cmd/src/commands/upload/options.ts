import { Option } from '@commander-js/extra-typings';

import { configKeys } from '../../config/upload';
import { getEnvironmentVariableName } from '../../config/utils';
import { tagOption } from '../options';

export const ciBuildIdOption = new Option(
  '--ci-build-id <id>',
  'the CI build ID to record the run with; by default taken from the CI environment, or a random value'
).env(getEnvironmentVariableName(configKeys, 'ciBuildId'));

export const runTagOption = tagOption('tags to add to the run').env(
  getEnvironmentVariableName(configKeys, 'tag')
);

export const removeTagOption = new Option(
  '--remove-title-tags',
  'remove tags from test names in Currents, e.g. `Test name @smoke` becomes `Test name` in the dashboard'
)
  .env(getEnvironmentVariableName(configKeys, 'removeTitleTags'))
  .default(false);

export const disableTitleTagsOption = new Option(
  '--disable-title-tags',
  'do not read tags from test names, e.g. `Test name @smoke` is not tagged with `smoke` in the dashboard'
)
  .env(getEnvironmentVariableName(configKeys, 'disableTitleTags'))
  .default(false);

export const machineIdOption = new Option(
  '--machine-id <id>',
  'the ID of the machine that ran the tests; by default a random value'
).env(getEnvironmentVariableName(configKeys, 'machineId'));

export const reportDirOption = new Option(
  '--report-dir <folder>',
  'the folder of the reports to upload; by default the newest folder in .currents'
).env(getEnvironmentVariableName(configKeys, 'reportDir'));
