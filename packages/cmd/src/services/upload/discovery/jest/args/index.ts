import { isEmpty } from 'lodash';
import { CLIArgs } from '../../../types';
import { argvToString } from '../../utils';
import { getDiscoveryOptions } from './args';
import { getConfigFilePath } from './config';

export async function getCLIArgs(
  cliArgsFromConfig: CLIArgs
): Promise<{ cliArgs: string[]; configFilePath: string | null }> {
  const testNamePattern = '!!##ThisPatternWillNotMatchAnyTestName##!!';

  const jestOptions = cliArgsFromConfig.options;
  const discoveryOptions = getDiscoveryOptions(jestOptions);
  const discoveryOptionsString = argvToString(discoveryOptions);
  const explicitConfigFilePath = jestOptions['config'] as string | undefined;
  const configFilePath = await getConfigFilePath(explicitConfigFilePath);

  const cliArgs = [
    discoveryOptionsString,
    '--testNamePattern',
    testNamePattern,
    '--reporters',
    '@currents/cmd/discovery/jest',
    '--shard=1/1',
    configFilePath ? `--config=${configFilePath}` : '',
    ...(cliArgsFromConfig.args as string[]),
  ].filter((value) => !isEmpty(value));

  return { cliArgs, configFilePath };
}
