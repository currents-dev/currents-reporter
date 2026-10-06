import { createRequire } from 'node:module';
import path from 'node:path';
import semver from 'semver';

type JestCli = typeof import('jest-cli');
type JestConfig = typeof import('jest-config');

// jest-config exports readInitialOptions from 29.0.0. Jest 27 and older cannot
// load the discovery reporter, which is a package export.
const SUPPORTED_JEST_VERSIONS = '>=29.0.0';

// @currents/cmd does not install Jest. Discovery runs the Jest of the project
// in the current directory, the same directory `jest-cli` reads the Jest
// config from.
function resolveJestCli() {
  const projectRequire = createRequire(
    path.join(process.cwd(), 'package.json')
  );
  try {
    return projectRequire.resolve('jest-cli');
  } catch {
    // pnpm and Yarn PnP make only direct dependencies resolvable, and projects
    // usually depend on `jest`, not on `jest-cli`
  }
  try {
    return createRequire(projectRequire.resolve('jest')).resolve('jest-cli');
  } catch {
    throw new Error(
      `Jest discovery needs the "jest" package, and it is not installed in ${process.cwd()}. Run the command from the folder of the project that ran the tests, or install Jest 29 or later: npm install --save-dev jest`
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
      `Jest discovery needs Jest 29 or later, and ${process.cwd()} has Jest ${version}. Update Jest: npm install --save-dev jest@latest`
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
