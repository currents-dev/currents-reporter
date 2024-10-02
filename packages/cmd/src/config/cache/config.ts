import { debug as _debug } from '@debug';

import { getValidatedConfig } from '../utils';
import { configKeys, getEnvVariables } from './env';

const debug = _debug.extend('config');

export type CacheCommandConfig = {
  /**
   * The record key to be used to record the results on the remote dashboard. Read more: https://currents.dev/readme/guides/record-key
   */
  recordKey: string;

  /**
   * Enable or disable debug logging.
   */
  debug?: boolean;
};

type CommonConfig = {
  matrixIndex: number;
  matrixTotal: number;
  id?: string;
  preset?: string;
};

export type CacheSetCommandConfig = CacheCommandConfig &
  CommonConfig & {
    path?: string[];
    pwOutputDir?: string;
  };

export type CacheGetCommandConfig = CacheCommandConfig &
  CommonConfig & {
    outputDir?: string;
    presetOutput?: string;
  };

type MandatoryCacheCommandKeys = 'recordKey';

const mandatoryConfigKeys: MandatoryCacheCommandKeys[] = ['recordKey'];

let _config:
  | {
      type: 'SET_COMMAND_CONFIG';
      values: (CacheCommandConfig & CacheSetCommandConfig) | null;
    }
  | {
      type: 'GET_COMMAND_CONFIG';
      values: (CacheCommandConfig & CacheGetCommandConfig) | null;
    };

export function setCacheSetCommandConfig(
  options?: Partial<NonNullable<(typeof _config)['values']>>
) {
  _config = {
    type: 'SET_COMMAND_CONFIG',
    values: getValidatedConfig(
      configKeys,
      mandatoryConfigKeys,
      getEnvVariables,
      options
    ),
  };
  debug('Resolved config: %o', _config);
}

export function setCacheGetCommandConfig(
  options?: Partial<NonNullable<(typeof _config)['values']>>
) {
  _config = {
    type: 'GET_COMMAND_CONFIG',
    values: getValidatedConfig(
      configKeys,
      mandatoryConfigKeys,
      getEnvVariables,
      options
    ),
  };
  debug('Resolved config: %o', _config);
}

export function getCacheCommandConfig() {
  return _config;
}
