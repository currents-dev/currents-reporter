import { omit } from 'lodash';

const ignoredOptions = [
  'bail', // causes unexpected behaviour
  'clearCache',
  'collectCoverage',
  'collectCoverageFrom',
  'color',
  'colors',
  'config',
  'coverage',
  'coverageDirectory',
  'coveragePathIgnorePatterns',
  'coverageProvider',
  'coverageReporters',
  'coverageThreshold',
  'debug',
  'detectLeaks',
  'detectOpenHandles',
  'errorOnDeprecated',
  'expand',
  'forceExit',
  'json',
  'listTests',
  'logHeapUsage',
  'noStackTrace',
  'notify',
  'notifyMode',
  'openHandlesTimeout',
  'outputFile',
  'reporters',
  'runner',
  'shard',
  'showConfig',
  'showSeed',
  'silent',
  'testNamePattern',
  'verbose',
  'waitNextEventLoopTurnForUnhandledRejectionEvents',
  'watch',
  'watchAll',
  'watchPathIgnorePatterns',
  'watchman',
];

export function getDiscoveryOptions(options: Record<string, unknown>) {
  return omit(options, ...ignoredOptions);
}
