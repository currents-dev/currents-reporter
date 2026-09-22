import { Config } from '@jest/types';
import { omit } from 'lodash';
import { ReportConfig } from '../types';
import { getJestArgv } from './args';
import { DetoxSession } from './detox';
import { getJestVersion } from './versions';

export function getReportConfig(
  config: Config.GlobalConfig,
  detox?: DetoxSession
): ReportConfig {
  const argv = getJestArgv();

  return {
    framework: 'jest',
    frameworkVersion: getJestVersion(),
    cliArgs: {
      options: omit(argv, '_', '$0'),
      args: argv._ as string[],
    },
    // originFramework is read by `currents upload` and shown as the framework
    // of the run, the same way junit reports carry postman or vitest.
    frameworkConfig: detox
      ? {
          ...config,
          originFramework: 'detox',
          originFrameworkVersion: detox.version ?? null,
        }
      : config,
  };
}
