import { isEmpty } from 'lodash';
import { CLIArgs } from 'services/upload/types';
import { argvToString } from '../utils';

export async function getCLIArgs(
  cliArgsFromConfig: CLIArgs
): Promise<{ cliArgs: string[] }> {
  const options = cliArgsFromConfig.options;
  const discoveryOptionsString = argvToString(options);

  const cliArgs = [
    discoveryOptionsString,
    ...(cliArgsFromConfig.args as string[]),
  ].filter((value) => !isEmpty(value));

  return { cliArgs };
}
