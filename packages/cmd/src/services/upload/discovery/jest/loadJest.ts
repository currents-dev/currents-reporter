import { createRequire } from 'node:module';
import path from 'node:path';
import semver from 'semver';

type JestCli = typeof import('jest-cli');
type JestConfig = typeof import('jest-config');

// The range @currents/jest supports, the reporter that writes the results
// discovery runs for. jest-config has no readInitialOptions before 29.0.0.
const SUPPORTED_JEST_VERSIONS = '>=29.5.0';

// @currents/cmd does not install Jest. Discovery runs the Jest of the project
// in the current directory, the same directory `jest-cli` reads the Jest
// config from.
function resolveJestCli() {
  const projectRequire = createRequire(
    path.join(process.cwd(), 'package.json')
  );
  // The jest-cli of the project's `jest` comes first: another jest-cli can be
  // resolvable from the project, such as one of an older version hoisted to the
  // root of a monorepo. pnpm and Yarn PnP make only direct dependencies
  // resolvable, so jest-cli is not resolvable from the project itself there.
  try {
    return createRequire(projectRequire.resolve('jest')).resolve('jest-cli');
  } catch {
    // projects that depend on jest-cli instead of jest
  }
  try {
    return projectRequire.resolve('jest-cli');
  } catch {
    throw new Error(
      `Jest discovery needs the "jest" package, and it is not installed in ${process.cwd()}. Run the command from the folder of the project that ran the tests, or install Jest 29.5 or later: npm install --save-dev jest`
    );
  }
}

function getJestCliRequire() {
  const jestCliRequire = createRequire(resolveJestCli());
  const { version } = jestCliRequire('jest-cli/package.json') as {
    version: string;
  };
  if (
    !semver.satisfies(version, SUPPORTED_JEST_VERSIONS, {
      includePrerelease: true,
    })
  ) {
    throw new Error(
      `Jest discovery needs Jest 29.5 or later, and ${process.cwd()} has Jest ${version}. Update Jest: npm install --save-dev jest@latest`
    );
  }
  return jestCliRequire;
}

export function loadJestCli(): JestCli {
  return getJestCliRequire()('jest-cli');
}

// jest-config is a dependency of jest-cli, so it is resolved from there.
export function loadJestConfig(): JestConfig {
  return getJestCliRequire()('jest-config');
}
