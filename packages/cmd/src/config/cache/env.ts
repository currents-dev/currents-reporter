import { sharedConfigKeys } from '../keys';

const cacheCommandConfigKeys = {
  recordKey: sharedConfigKeys.recordKey,
  debug: sharedConfigKeys.debug,
} as const;

const cacheSetCommandConfigKeys = {
  id: {
    name: 'Cache id',
    cli: '--id',
  },
  preset: {
    name: 'Preset',
    cli: '--preset',
  },
  pwOutputDir: {
    name: 'Playwright output folder',
    cli: '--pw-output-dir',
  },
  presetOutput: {
    name: 'Preset output path',
    cli: '--preset-output',
  },
  path: {
    name: 'Paths to cache',
    cli: '--path',
  },
  matrixIndex: {
    name: 'Matrix index',
    cli: '--matrix-index',
  },
  matrixTotal: {
    name: 'Matrix total',
    cli: '--matrix-total',
  },
  continue: {
    name: 'Continue when upload path missing',
    cli: '--continue',
  },
} as const;

const cacheGetCommandConfigKeys = {
  id: {
    name: 'Cache id',
    cli: '--id',
  },
  preset: {
    name: 'Preset',
    cli: '--preset',
  },
  outputDir: {
    name: 'Output folder',
    cli: '--output-dir',
  },
  matrixIndex: {
    name: 'Matrix index',
    cli: '--matrix-index',
  },
  matrixTotal: {
    name: 'Matrix total',
    cli: '--matrix-total',
  },
  continue: {
    name: 'Continue on cache miss',
    cli: '--continue',
  },
} as const;

export const configKeys = {
  ...cacheCommandConfigKeys,
  ...cacheSetCommandConfigKeys,
  ...cacheGetCommandConfigKeys,
} as const;
