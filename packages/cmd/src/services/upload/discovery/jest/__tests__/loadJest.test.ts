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
  fs.outputFileSync(join(dir, 'index.js'), `exports.name = '${name}';`);
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
    const jestDir = join(projectDir, 'node_modules/jest');
    const jestCliDir = join(jestDir, 'node_modules/jest-cli');
    writePackage(jestDir, 'jest', '30.0.0');
    writePackage(jestCliDir, 'jest-cli', '30.0.0');
    writePackage(
      join(jestCliDir, 'node_modules/jest-config'),
      'jest-config',
      '30.0.0'
    );

    expect(loadJestCli()).toMatchObject({ name: 'jest-cli' });
    expect(loadJestConfig()).toMatchObject({ name: 'jest-config' });
  });

  it('fails with the install command when the project has no Jest', () => {
    expect(() => loadJestCli()).toThrow(
      'Jest discovery needs the "jest" package'
    );
    expect(() => loadJestCli()).toThrow('npm install --save-dev jest');
  });

  it('fails when the project has Jest older than 29', () => {
    writePackage(
      join(projectDir, 'node_modules/jest-cli'),
      'jest-cli',
      '28.1.3'
    );

    expect(() => loadJestCli()).toThrow(
      `Jest discovery needs Jest 29 or later, and ${projectDir} has Jest 28.1.3`
    );
  });
});
