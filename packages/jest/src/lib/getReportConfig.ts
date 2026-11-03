import { Config } from '@jest/types';
import { ReportConfig } from '../types';
import { getJestArgv } from './args';
import { DetoxSession } from './detox';
import { getJestVersion } from './versions';

export function getReportConfig(
  config: Config.GlobalConfig,
  detox?: DetoxSession
): ReportConfig {
  const { _, $0, ...options } = getJestArgv();

  return {
    framework: 'jest',
    frameworkVersion: getJestVersion(),
    cliArgs: {
      options,
      args: _ as string[],
    },
    // originFramework is read by `currents run upload` and shown as the
    // framework of the run, the same way junit reports carry postman or vitest.
    frameworkConfig: detox
      ? {
          ...config,
          originFramework: 'detox',
          ...(detox.version && { originFrameworkVersion: detox.version }),
        }
      : config,
  };
}
