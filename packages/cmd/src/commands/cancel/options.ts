import { Option } from '@commander-js/extra-typings';
import { configKeys } from '../../config/cancel';
import { getEnvironmentVariableName } from '../../config/utils';

export const recordKeyOption = new Option(
  '-k, --key <record-key>',
  'your secret Record Key obtained from Currents'
).env(getEnvironmentVariableName(configKeys, 'recordKey'));

export const projectOption = new Option(
  '-p, --project-id <project>',
  'the project ID the run belongs to'
).env(getEnvironmentVariableName(configKeys, 'projectId'));

export const ciBuildIdOption = new Option(
  '--ci-build-id <id>',
  'the unique identifier of the build (run) to cancel'
).env(getEnvironmentVariableName(configKeys, 'ciBuildId'));

export const runIdOption = new Option(
  '--run-id <id>',
  'the identifier of the run to cancel, as reported when the run was created'
).env(getEnvironmentVariableName(configKeys, 'runId'));

export const debugOption = new Option('--debug', 'enable debug logs')
  .env(getEnvironmentVariableName(configKeys, 'debug'))
  .default(false);
