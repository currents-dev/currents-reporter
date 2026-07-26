import { debug as _debug } from '@debug';

import { maskRecordKey } from '@lib';
import { ValidationError } from '@lib/error';
import { dim, error } from '@logger';
import {
  getCLIOptionName,
  getConfigName,
  getEnvironmentVariableName,
  getValidatedConfig,
} from '../utils';
import { configKeys, getEnvVariables } from './env';

const debug = _debug.extend('config');

export type CancelCommandConfig = {
  /**
   * The record key the CI job already uses to report results. The same key
   * authorizes cancelling the run it created.
   */
  recordKey: string;

  /**
   * Identifier for the project the run belongs to.
   */
  projectId: string;

  /**
   * Identifier of the build to cancel - the same value the run was recorded
   * with. See: https://currents.dev/readme/guides/ci-build-id
   */
  ciBuildId?: string;

  /**
   * Identifier of the run to cancel, as reported when the run was created.
   * Takes precedence over ciBuildId.
   */
  runId?: string;

  /**
   * Enable or disable debug logging.
   */
  debug?: boolean;
};

type MandatoryCancelCommandConfigKeys = 'recordKey' | 'projectId';

const mandatoryConfigKeys: MandatoryCancelCommandConfigKeys[] = [
  'recordKey',
  'projectId',
];

/**
 * Either value identifies the run, so neither is mandatory on its own.
 */
function requireRunIdentifier(config: CancelCommandConfig) {
  if (config.runId || config.ciBuildId) {
    return;
  }

  error(
    `${getConfigName(configKeys, 'runId')} or ${getConfigName(
      configKeys,
      'ciBuildId'
    )} is required for Currents Reporter. Use the following methods to set the value:
- as environment variable: ${dim(
      getEnvironmentVariableName(configKeys, 'runId')
    )} or ${dim(getEnvironmentVariableName(configKeys, 'ciBuildId'))}
- as CLI flag of the command: ${dim(
      getCLIOptionName(configKeys, 'runId')
    )} or ${dim(getCLIOptionName(configKeys, 'ciBuildId'))}`
  );
  throw new ValidationError('Missing required config variable');
}

let _config: CancelCommandConfig | null = null;

export function setCancelCommandConfig(options?: Partial<CancelCommandConfig>) {
  _config = getValidatedConfig(
    configKeys,
    mandatoryConfigKeys,
    getEnvVariables,
    options,
    requireRunIdentifier
  );
  debug('Resolved config: %o', maskRecordKey(_config));
}

export function getCancelCommandConfig() {
  return _config;
}
