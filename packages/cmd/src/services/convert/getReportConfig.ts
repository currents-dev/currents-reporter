import { ConvertCommandConfig } from '../../config/convert';
import { ReportConfig } from './types';

export function getReportConfig(config: ConvertCommandConfig): ReportConfig {
  return {
    framework: config.framework,
    frameworkVersion: config.frameworkVersion ?? null,
    cliArgs: {},
    frameworkConfig: {
      format: config.inputFormat,
    },
  };
}
