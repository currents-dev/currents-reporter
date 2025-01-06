import { ConvertCommandConfig } from '../../config/convert';
import { ReportConfig } from './types';

export function getReportConfig(config: ConvertCommandConfig): ReportConfig {
  return {
    framework: config.inputFormat,
    frameworkVersion: config.frameworkVersion ?? null,
    frameworkConfig: {
      originFramework: config.framework,
      originFrameworkVersion: config.frameworkVersion,
    },
  };
}
