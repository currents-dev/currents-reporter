import { debug as _debug } from '@debug';

import { getValidatedConfig } from '../utils';
import { configKeys, getEnvVariables } from './env';

const debug = _debug.extend('config');

export type CurrentsConfig = {
  /**
   * The id of the build to record the test run. Read more: https://currents.dev/readme/guides/ci-build-id
   */
  ciBuildId?: string;

  /**
   * The id of the project to record the test run.
   */
  projectId: string;

  /**
   * The record key to be used to record the results on the remote dashboard. Read more: https://currents.dev/readme/guides/record-key
   */
  recordKey: string;

  /**
   * A list of tags to be added to the test run.
   */
  tag?: string[];

  /**
   * remove tags from test names, for example `Test name @smoke` becomes `Test name`
   */
  removeTitleTags?: boolean;

  /**
   * disable extracting tags from test title, e.g. `Test name @smoke` would not be tagged with `smoke`
   */
  disableTitleTags?: boolean;

  /**
   * Unique identifier of the machine running the tests. If not provided, it will be generated automatically. See: https://currents.dev/readme/readme?q=machineId
   */
  machineId?: string;

  /**
   * Path to the report directory.
   */
  reportDir?: string;

  /**
   * Enable debug logs.
   */
  debug?: boolean;
};

type MandatoryCurrentsConfigKeys = 'projectId' | 'recordKey';

const mandatoryConfigKeys: MandatoryCurrentsConfigKeys[] = [
  'projectId',
  'recordKey',
];

let _config: CurrentsConfig | null = null;

/**
 * Precendence: env > reporter config
 * @param reporterOptions reporter config
 */
export function setCurrentsConfig(reporterOptions?: Partial<CurrentsConfig>) {
  _config = getValidatedConfig(
    configKeys,
    mandatoryConfigKeys,
    getEnvVariables,
    reporterOptions
  );
  debug('Resolved Currents config: %o', _config);
}

export function getCurrentsConfig() {
  return _config;
}
