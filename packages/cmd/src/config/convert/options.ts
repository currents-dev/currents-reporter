import { ConvertCommandOpts } from '../../commands/convert/convert';
import { ConvertCommandConfig } from './config';

export function convertCommandOptsToConfig(
  options: ConvertCommandOpts
): Partial<ConvertCommandConfig> {
  return {
    inputFile: options.inputFile,
    inputFormat: options.inputFormat,
    outputDir: options.outputDir,
    framework: options.framework,
    frameworkVersion: options.frameworkVersion,
    debug: options.debug,
  };
}
