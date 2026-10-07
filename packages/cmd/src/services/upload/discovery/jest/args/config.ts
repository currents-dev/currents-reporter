import { debug as _debug } from '@debug';
import { error } from '@logger';
import fs from 'fs';
import { omit } from 'lodash';
import path from 'path';
import { loadJestConfig } from '../loadJest';
import { retryWithBackoff } from '../utils';
import { readFileContents } from '../utils/fs';

const debug = _debug.extend('jest-discovery');

type ProjectOptions = Record<string, unknown>;

// Detox boots a device in its test environment's setup(), which Jest calls
// for every test file, also when no test runs. Its globalSetup fails outside
// `detox test` when the Detox config has several configurations. Discovery
// loads the files of a Detox project in the node environment instead.
function isDetoxProject(project: ProjectOptions) {
  return ['testEnvironment', 'globalSetup', 'globalTeardown'].some((key) =>
    String(project[key] ?? '').includes('detox')
  );
}

function withoutDetox<T extends ProjectOptions>(project: T): T {
  return {
    ...omit(project, [
      'globalSetup',
      'globalTeardown',
      'testEnvironmentOptions',
    ]),
    testEnvironment: 'node',
  } as unknown as T;
}

export async function getConfigFilePath(
  explicitConfigFilePath: string | undefined,
  options: { detox: boolean }
): Promise<string | null> {
  let hasDetoxConfig = options.detox;
  try {
    const { readInitialOptions } = loadJestConfig();
    const { config: initialConfig, configPath } = await readInitialOptions(
      explicitConfigFilePath
    );
    hasDetoxConfig ||= [initialConfig, ...(initialConfig.projects ?? [])].some(
      (project) =>
        typeof project !== 'string' && isDetoxProject(project as ProjectOptions)
    );

    const configOptionsToAvoid = [
      // from docs: https://jestjs.io/docs/configuration
      'collectCoverage',
      'collectCoverageFrom',
      'coverageDirectory',
      'coveragePathIgnorePatterns',
      'coverageProvider',
      'coverageReporters',
      'coverageThreshold',
      'errorOnDeprecated',
      'forceCoverageMatch',
      'notify',
      'notifyMode',
      'openHandlesTimeout',
      'reporters',
      'runner',
      'showSeed',
      'testFailureExitCode',
      'verbose',
      'watchPathIgnorePatterns',
      'watchPlugins',
      'watchman',

      // from Config type
      'bail', // causes unexpected behaviour
      'clearCache',
      'color',
      'colors',
      'debug',
      'detectLeaks',
      'detectOpenHandles',
      'expand',
      'forceExit',
      'json',
      'listTests',
      'logHeapUsage',
      'noStackTrace',
      'outputFile',
      'shard',
      'showConfig',
      'silent',
      'testNamePattern',
      'waitNextEventLoopTurnForUnhandledRejectionEvents',
      'watch',
      'watchAll',
    ];

    // from InitialProjectOptions type
    const projectConfigOptionsToAvoid = [
      'collectCoverageFrom',
      'coverageDirectory',
      'coveragePathIgnorePatterns',
      'detectLeaks',
      'detectOpenHandles',
      'errorOnDeprecated',
      'forceCoverageMatch',
      'openHandlesTimeout',
      'runner',
      'watchPathIgnorePatterns',
    ];

    const useNodeEnvironment = (project: ProjectOptions) =>
      options.detox || isDetoxProject(project);

    let parsedConfigObject = omit(initialConfig, configOptionsToAvoid);
    if (useNodeEnvironment(parsedConfigObject)) {
      parsedConfigObject = withoutDetox(parsedConfigObject);
    }

    if (parsedConfigObject.projects) {
      parsedConfigObject.projects = parsedConfigObject.projects.map(
        (project) => {
          if (typeof project === 'string') {
            return project;
          }
          const discoveryProject = omit(project, projectConfigOptionsToAvoid);
          return useNodeEnvironment(discoveryProject)
            ? withoutDetox(discoveryProject)
            : discoveryProject;
        }
      );
    }

    if (
      parsedConfigObject.rootDir &&
      Object.keys(parsedConfigObject).length === 1
    ) {
      return null;
    }

    const tmpFilePath = path.resolve(
      configPath ? path.dirname(configPath) : process.cwd(),
      `.jest-scanner-${new Date().getTime()}.config.cjs`
    );

    const configFileContents = `module.exports=${JSON.stringify(parsedConfigObject, null, 2)}`;
    debug('configFileContent: %O', configFileContents);
    fs.writeFileSync(tmpFilePath, configFileContents);

    await retryWithBackoff(
      readFileContents,
      [200, 200, 200, 200, 200, 1000]
    )(tmpFilePath);

    return tmpFilePath;
  } catch (err) {
    debug('error %o', err);
    // Without the rewritten config, discovery of a Detox project would boot
    // a device.
    if (hasDetoxConfig) {
      throw new Error(
        `Failed to recreate the Jest config for discovery: ${(err as Error).message}`
      );
    }
    error('Failed to recreate the config file');
    return null;
  }
}
