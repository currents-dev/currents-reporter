import type { readInitialOptions } from 'jest-config';
import type { run } from 'jest-cli';
import { createRequire } from 'module';
import path from 'path';
import semver from 'semver';

// The range @currents/jest supports. jest-config has no readInitialOptions
// before Jest 29.
export const SUPPORTED_JEST_RANGE = '>=29.5.0';

const INSTALL_COMMAND = 'npm install --save-dev jest';

export type ProjectJest = {
  run: typeof run;
  readInitialOptions: typeof readInitialOptions;
};

/**
 * Loads Jest from the project in `projectDir`, so that discovery runs the
 * same Jest version as the tests did.
 */
export function loadProjectJest(projectDir = process.cwd()): ProjectJest {
  const projectRequire = createRequire(path.join(projectDir, 'package.json'));

  // pnpm links only the packages a project lists: the project reaches
  // jest-cli through jest, and jest-config through jest-cli.
  const jestPath = tryResolve(projectRequire, 'jest');
  const jestCliPath = tryResolve(
    jestPath ? createRequire(jestPath) : projectRequire,
    'jest-cli'
  );
  if (!jestCliPath) {
    throw missingPackageError('jest-cli', projectDir);
  }

  const jestCliRequire = createRequire(jestCliPath);
  const { version } = jestCliRequire('jest-cli/package.json') as {
    version: string;
  };
  if (
    !semver.satisfies(version, SUPPORTED_JEST_RANGE, {
      includePrerelease: true,
    })
  ) {
    throw new Error(
      `Jest discovery needs Jest ${SUPPORTED_JEST_RANGE}, the project in ${projectDir} has Jest ${version}. Upgrade Jest in the project: ${INSTALL_COMMAND}@latest`
    );
  }

  const jestConfigPath = tryResolve(jestCliRequire, 'jest-config');
  if (!jestConfigPath) {
    throw missingPackageError('jest-config', projectDir);
  }

  return {
    run: (jestCliRequire(jestCliPath) as ProjectJest).run,
    readInitialOptions: (jestCliRequire(jestConfigPath) as ProjectJest)
      .readInitialOptions,
  };
}

function tryResolve(require: NodeJS.Require, name: string) {
  try {
    return require.resolve(name);
  } catch {
    return null;
  }
}

function missingPackageError(name: string, projectDir: string) {
  return new Error(
    `Jest discovery runs Jest from the project, and ${name} cannot be found from ${projectDir}. Run the command in the folder of the Jest project, or install Jest ${SUPPORTED_JEST_RANGE} there: ${INSTALL_COMMAND}`
  );
}
