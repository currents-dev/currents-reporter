import { sharedConfigKeys } from '../keys';

export const configKeys = {
  debug: sharedConfigKeys.debug,
  inputFormat: {
    name: 'Input format',
    cli: '--input-format',
  },
  inputFiles: {
    name: 'Input file',
    cli: '--input-file',
  },
  outputDir: {
    name: 'Output folder',
    cli: '--output-dir',
  },
  framework: {
    name: 'Framework',
    cli: '--framework',
  },
  frameworkVersion: {
    name: 'Framework version',
    cli: '--framework-version',
  },
} as const;
