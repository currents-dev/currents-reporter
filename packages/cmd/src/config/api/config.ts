import { debug as _debug } from '@debug';

import { maskApiKey, ValidationError } from '@lib';
import { error } from '@logger';
import { getValidatedConfig } from '../utils';
import { configKeys, getEnvVariables } from './env';

const debug = _debug.extend('config');

export type APICommandConfig = {
  /**
   * API key for authentication with the Currents API.
   * For more information on managing API keys, visit:
   * https://docs.currents.dev/resources/api/api-keys#managing-the-api-keys
   */
  apiKey: string;

  /**
   * Identifier for the project where the test run is recorded.
   */
  projectId: string;

  /**
   * Enable or disable debug logging.
   */
  debug?: boolean;
};

export type APIGetRunCommandConfig = {
  /**
   * Identifier for the build associated with the test run.
   * Refer to: https://currents.dev/readme/guides/ci-build-id for more details.
   */
  ciBuildId?: string;

  /**
   * The branch of the project for which the test run was created.
   */
  branch?: string;

  /**
   * List of tags associated with the test run.
   */
  tag?: string[];

  /**
   * Flag indicating whether to return the "LastRunResponse" data.
   *
   * type LastRunResponse = {
   *   status: 'failed' | 'passed';
   *   failedTests: string[];
   * };
   *
   * Default is false if not specified.
   */
  pwLastRun?: boolean;

  /**
   * File path to which the output should be written.
   * If not specified, the output will be written to the console.
   */
  output?: string;
};

type MandatoryAPICommandConfigKeys = 'apiKey' | 'projectId';

const mandatoryConfigKeys: MandatoryAPICommandConfigKeys[] = [
  'apiKey',
  'projectId',
];

export const apiGetRunCustomValidation = (
  config: APICommandConfig & APIGetRunCommandConfig
) => {
  const { ciBuildId, tag, branch } = config;
  const count = [ciBuildId, tag, branch].filter(Boolean).length;
  const isValid = count === 1 || (tag && branch && !ciBuildId);
  if (!isValid) {
    error(
      '"ciBuildId", "tag", "branch" or a combination of "tag" and "branch" are expected to be provided'
    );
    throw new ValidationError('Missing or invalid parameters');
  }
};

let _config: (APICommandConfig & APIGetRunCommandConfig) | null = null;

export function setAPIGetRunCommandConfig(
  options?: Partial<APICommandConfig & APIGetRunCommandConfig>
) {
  _config = getValidatedConfig(
    configKeys,
    mandatoryConfigKeys,
    getEnvVariables,
    options,
    apiGetRunCustomValidation
  );
  debug('Resolved config: %o', maskApiKey(_config));
}

export function getAPIGetRunCommandConfig() {
  return _config;
}
