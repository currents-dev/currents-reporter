import { ConvertCommandConfig } from './config';

export const configKeys = {
  debug: {
    name: 'Debug',
    env: 'CURRENTS_DEBUG',
    cli: '--debug',
  },
  inputFormat: {
    name: 'Input Format',
    cli: '--input-format',
  },
  inputFiles: {
    name: 'Input File',
    cli: '--input-file',
  },
  outputDir: {
    name: 'Output Dir',
    cli: '--output-dir',
  },
  framework: {
    name: 'Framework',
    cli: '--framework',
  },
  frameworkVersion: {
    name: 'Framework Version',
    cli: '--framework-version',
  },
} as const;

export function getEnvVariables(): Partial<
  Record<keyof ConvertCommandConfig, string | string[] | boolean | undefined>
> {
  return {
    debug: process.env[configKeys.debug.env],
  };
}
