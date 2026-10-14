import { ConvertCommandConfig } from '../../config/convert';
import { ReportConfig } from './types';

export function getReportConfig(config: ConvertCommandConfig): ReportConfig {
  return {
    // The API takes converted reports of every input format as `junit`
    framework: 'junit',
    frameworkVersion: config.frameworkVersion ?? null,
    frameworkConfig: {
      originFramework: config.framework,
      originFrameworkVersion: config.frameworkVersion,
    },
  };
}
