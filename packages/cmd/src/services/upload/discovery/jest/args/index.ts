import { isEmpty } from 'lodash';
import { CLIArgs } from '../../../types';
import { argvToString } from '../../utils';
import { getDiscoveryOptions } from './args';
import { getConfigFilePath } from './config';

export async function getCLIArgs(
  cliArgsFromConfig: CLIArgs,
  options: { detox: boolean }
): Promise<{ cliArgs: string[]; configFilePath: string | null }> {
  const testNamePattern = '!!##ThisPatternWillNotMatchAnyTestName##!!';

  const jestOptions = cliArgsFromConfig.options;
  const discoveryOptions = getDiscoveryOptions(jestOptions);
  const discoveryOptionsString = argvToString(discoveryOptions);
  const explicitConfigFilePath = jestOptions['config'] as string | undefined;
  const configFilePath = await getConfigFilePath(
    explicitConfigFilePath,
    options
  );

  const cliArgs = [
    discoveryOptionsString,
    '--testNamePattern',
    testNamePattern,
    '--reporters',
    // Jest resolves a reporter name from the project folder, which may not
    // have @currents/cmd installed, for example with npx.
    require.resolve('@currents/cmd/discovery/jest'),
    '--shard=1/1',
    // Jest sets the process exit code when a test file fails to load, and
    // the upload goes on with the tests of that file from the results.
    '--testFailureExitCode=0',
    configFilePath ? `--config=${configFilePath}` : '',
    ...(cliArgsFromConfig.args as string[]),
  ].filter((value) => !isEmpty(value));

  return { cliArgs, configFilePath };
}
