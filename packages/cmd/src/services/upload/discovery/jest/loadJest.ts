import fs from 'node:fs';
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
  if (getNearestJestPackage(projectRequire) === 'jest-cli') {
    return projectRequire.resolve('jest-cli');
  }
  // pnpm and Yarn PnP make only direct dependencies resolvable, so the
  // jest-cli of a project that depends on `jest` is resolved from `jest`.
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

// `npx jest` runs the `jest` binary of the nearest node_modules that has jest
// or jest-cli, as both packages install it. Discovery uses the same Jest, and
// not, for example, a jest-cli of another version hoisted next to the
// project's jest, or the jest of a monorepo root above a project that depends
// on jest-cli. Without node_modules (Yarn PnP) this returns null.
function getNearestJestPackage(projectRequire: NodeJS.Require) {
  for (const dir of projectRequire.resolve.paths('jest') ?? []) {
    if (fs.existsSync(path.join(dir, 'jest', 'package.json'))) {
      return 'jest';
    }
    if (fs.existsSync(path.join(dir, 'jest-cli', 'package.json'))) {
      return 'jest-cli';
    }
  }
  return null;
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
