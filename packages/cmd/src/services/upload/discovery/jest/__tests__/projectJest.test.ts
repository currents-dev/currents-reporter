import fs from 'fs-extra';
import os from 'os';
import { join } from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadProjectJest } from '../projectJest';

function writePackage(dir: string, name: string, version: string, main = '') {
  fs.outputJsonSync(join(dir, 'package.json'), { name, version });
  fs.outputFileSync(join(dir, 'index.js'), main);
}

describe('loadProjectJest', () => {
  let projectDir: string;

  beforeEach(() => {
    projectDir = fs.mkdtempSync(join(os.tmpdir(), 'currents-jest-'));
    fs.outputJsonSync(join(projectDir, 'package.json'), { name: 'project' });
  });

  afterEach(() => {
    fs.removeSync(projectDir);
  });

  // The layout pnpm creates: only jest is reachable from the project.
  function installJest(version: string) {
    const jestDir = join(projectDir, 'node_modules', 'jest');
    const jestCliDir = join(jestDir, 'node_modules', 'jest-cli');
    writePackage(jestDir, 'jest', version);
    writePackage(
      jestCliDir,
      'jest-cli',
      version,
      `exports.run = async () => 'run ${version}';`
    );
    writePackage(
      join(jestCliDir, 'node_modules', 'jest-config'),
      'jest-config',
      version,
      `exports.readInitialOptions = async () => 'readInitialOptions ${version}';`
    );
  }

  it('loads jest-cli and jest-config through the jest of the project', async () => {
    installJest('29.7.0');

    const jest = loadProjectJest(projectDir);

    await expect(jest.run()).resolves.toBe('run 29.7.0');
    await expect(jest.readInitialOptions()).resolves.toBe(
      'readInitialOptions 29.7.0'
    );
  });

  it('names the missing package and the install command', () => {
    expect(() => loadProjectJest(projectDir)).toThrow(
      `Jest discovery runs Jest from the project, and jest-cli cannot be found from ${projectDir}. Run the command in the folder of the Jest project, or install Jest >=29.5.0 there: npm install --save-dev jest`
    );
  });

  it('rejects a Jest version without readInitialOptions', () => {
    installJest('28.1.3');

    expect(() => loadProjectJest(projectDir)).toThrow(
      `Jest discovery needs Jest >=29.5.0, the project in ${projectDir} has Jest 28.1.3. Upgrade Jest in the project: npm install --save-dev jest@latest`
    );
  });
});
