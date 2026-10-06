import fs from 'fs-extra';
import os from 'os';
import { join } from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadJestCli, loadJestConfig } from '../loadJest';

function writePackage(dir: string, name: string, version: string) {
  fs.outputJsonSync(join(dir, 'package.json'), {
    name,
    version,
    main: 'index.js',
  });
  fs.outputFileSync(
    join(dir, 'index.js'),
    `exports.name = '${name}'; exports.version = '${version}';`
  );
}

// The layout pnpm creates: only jest is resolvable from the project.
function installJest(version: string) {
  const jestDir = join(process.cwd(), 'node_modules/jest');
  const jestCliDir = join(jestDir, 'node_modules/jest-cli');
  writePackage(jestDir, 'jest', version);
  writePackage(jestCliDir, 'jest-cli', version);
  writePackage(
    join(jestCliDir, 'node_modules/jest-config'),
    'jest-config',
    version
  );
}

describe('loadJest', () => {
  let projectDir: string;

  beforeEach(() => {
    projectDir = fs.mkdtempSync(join(os.tmpdir(), 'load-jest-'));
    vi.spyOn(process, 'cwd').mockReturnValue(projectDir);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.removeSync(projectDir);
  });

  it('loads jest-cli and jest-config of the project', () => {
    vi.mocked(process.cwd).mockReturnValue(
      join(__dirname, '../../../../../..')
    );

    expect(loadJestCli().run).toBeTypeOf('function');
    expect(loadJestConfig().readInitialOptions).toBeTypeOf('function');
  });

  it('finds jest-cli through jest when only jest is a direct dependency', () => {
    installJest('30.0.0');

    expect(loadJestCli()).toMatchObject({
      name: 'jest-cli',
      version: '30.0.0',
    });
    expect(loadJestConfig()).toMatchObject({ name: 'jest-config' });
  });

  it('prefers the jest-cli of the project jest over another resolvable jest-cli', () => {
    installJest('30.0.0');
    writePackage(
      join(projectDir, 'node_modules/jest-cli'),
      'jest-cli',
      '28.1.3'
    );

    expect(loadJestCli()).toMatchObject({
      name: 'jest-cli',
      version: '30.0.0',
    });
  });

  it('prefers a jest-cli of the project over the jest of a parent folder', () => {
    installJest('29.7.0');
    const packageDir = join(projectDir, 'packages/app');
    writePackage(
      join(packageDir, 'node_modules/jest-cli'),
      'jest-cli',
      '30.0.0'
    );
    vi.mocked(process.cwd).mockReturnValue(packageDir);

    expect(loadJestCli()).toMatchObject({
      name: 'jest-cli',
      version: '30.0.0',
    });
  });

  it('fails with the install command when the project has no Jest', () => {
    expect(() => loadJestCli()).toThrow(
      'Jest discovery needs the "jest" package'
    );
    expect(() => loadJestCli()).toThrow('npm install --save-dev jest');
  });

  it('fails when the project has Jest older than 29.5', () => {
    installJest('29.4.3');

    expect(() => loadJestCli()).toThrow(
      `Jest discovery needs Jest 29.5 or later, and ${projectDir} has Jest 29.4.3`
    );
  });
});
