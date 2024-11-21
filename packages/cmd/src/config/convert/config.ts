import { debug as _debug } from '@debug';
import { getValidatedConfig } from '../utils';
import { configKeys, getEnvVariables } from './env';

const debug = _debug.extend('config');

export type ConvertCommandConfig = {
  /**
   * The format of the input test reports.
   */
  inputFormat: string;

  /**
   * The array of paths to the test reports to convert.
   */
  inputFiles: string[];

  /**
   * The directory to save the converted test reports.
   */
  outputDir: string;

  /**
   * The testing framework used to generate the test reports.
   */
  framework: string;

  /**
   * The version of the testing framework used to generate the test reports.
   */
  frameworkVersion?: string;

  /**
   * Enable debug logs.
   */
  debug?: boolean;
};

type MandatoryConvertCommandConfigKeys =
  | 'inputFormat'
  | 'inputFiles'
  | 'outputDir'
  | 'framework';

const mandatoryConfigKeys: MandatoryConvertCommandConfigKeys[] = [
  'inputFormat',
  'inputFiles',
  'outputDir',
  'framework',
];

let _config: ConvertCommandConfig | null = null;

export function setConvertCommandConfig(
  reporterOptions?: Partial<ConvertCommandConfig>
) {
  _config = getValidatedConfig(
    configKeys,
    mandatoryConfigKeys,
    getEnvVariables,
    reporterOptions
  );
  debug('Resolved config: %o', _config);
}

export function getConvertCommandConfig() {
  return _config;
}
