import { Option } from '@commander-js/extra-typings';
import { configKeys } from '../../config/cancel';
import { getEnvironmentVariableName } from '../../config/utils';
import { recordedCiBuildIdOption } from '../options';

export const ciBuildIdOption = recordedCiBuildIdOption(
  ' (required unless --run-id is set)'
);

export const runIdOption = new Option(
  '--run-id <id>',
  'the ID of the run to cancel, as printed when the run was created; wins over --ci-build-id'
).env(getEnvironmentVariableName(configKeys, 'runId'));
