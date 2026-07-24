import { debug as _debug } from '@debug';

import { maskRecordKey } from '@lib';
import { getValidatedConfig } from '../utils';
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
  ciBuildId: string;

  /**
   * Enable or disable debug logging.
   */
  debug?: boolean;
};

type MandatoryCancelCommandConfigKeys = 'recordKey' | 'projectId' | 'ciBuildId';

const mandatoryConfigKeys: MandatoryCancelCommandConfigKeys[] = [
  'recordKey',
  'projectId',
  'ciBuildId',
];

let _config: CancelCommandConfig | null = null;

export function setCancelCommandConfig(options?: Partial<CancelCommandConfig>) {
  _config = getValidatedConfig(
    configKeys,
    mandatoryConfigKeys,
    getEnvVariables,
    options
  );
  debug('Resolved config: %o', maskRecordKey(_config));
}

export function getCancelCommandConfig() {
  return _config;
}
