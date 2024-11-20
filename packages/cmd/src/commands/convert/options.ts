import { Option, InvalidArgumentError } from '@commander-js/extra-typings';
import { glob } from 'glob';
import { configKeys } from '../../config/convert';
import { getEnvironmentVariableName } from '../../config/utils';

export const debugOption = new Option('--debug', 'Enable debug logging')
  .env(getEnvironmentVariableName(configKeys, 'debug'))
  .default(false);
export const inputFormatOption = new Option(
  '--input-format <string>',
  'the format of the input test reports. Supported formats: junit'
);
export const inputFileOption = new Option(
  '--input-file <pattern>',
  'the pattern to search for test reports'
).argParser(validateGlobPattern);
export const outputDirOption = new Option(
  '-o, --output-dir <string>',
  'the directory to save the converted test reports'
);
export const frameworkOption = new Option(
  '--framework <string>',
  'the testing framework used to generate the test reports'
);
export const frameworkVersionOption = new Option(
  '--framework-version <string>',
  'the version of the testing framework used to generate the test reports'
);

function validateGlobPattern(value: string) {
  const result = glob.globSync(value);
  if (result.length === 0) {
    throw new InvalidArgumentError('No files found with the provided pattern');
  }
  return result;
}
