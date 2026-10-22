import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { filterPaths, getLastRunFilePaths, getUploadPaths } from '../path';

vi.mock('../lib', () => ({ warn: vi.fn() }));

describe('cache paths', () => {
  let root: string;
  let cwd: string;

  beforeEach(() => {
    root = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), 'cache-path-'))
    );
    cwd = path.join(root, 'project');
    fs.outputFileSync(path.join(cwd, 'dist/a.js'), 'a');
    fs.outputFileSync(path.join(root, 'outside.txt'), 'secret');
    vi.spyOn(process, 'cwd').mockReturnValue(cwd);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.removeSync(root);
  });

  it('does not save a path outside the current folder', async () => {
    const paths = await getUploadPaths([
      path.join(cwd, 'dist/a.js'),
      path.join(root, 'outside.txt'),
      'dist/../../outside.txt',
    ]);

    expect(paths).toEqual([path.join(cwd, 'dist/a.js')]);
  });

  it('finds every .last-run.json under the Playwright output folder', async () => {
    fs.outputFileSync(path.join(cwd, 'test-results/.last-run.json'), '{}');
    fs.outputFileSync(path.join(cwd, 'test-results/s1/.last-run.json'), '{}');
    fs.outputFileSync(path.join(cwd, 'test-results/s1/trace.zip'), 'zip');

    expect((await getLastRunFilePaths()).sort()).toEqual([
      path.join(cwd, 'test-results/.last-run.json'),
      path.join(cwd, 'test-results/s1/.last-run.json'),
    ]);
  });

  it('finds .last-run.json in an output folder outside the current folder', async () => {
    fs.outputFileSync(path.join(root, 'pw-out/.last-run.json'), '{}');

    expect(await getLastRunFilePaths(path.join(root, 'pw-out'))).toEqual([
      path.join(root, 'pw-out/.last-run.json'),
    ]);
  });

  it.each(['../outside.txt', '/etc/hosts', 'dist/../../outside.txt', '..'])(
    'leaves out %s',
    (filePath) => {
      expect(filterPaths([filePath])).toEqual([]);
    }
  );

  it.each(['dist/a.js', 'dist/**/*', './dist', '..cache/file'])(
    'keeps %s',
    (filePath) => {
      expect(filterPaths([filePath])).toEqual([filePath]);
    }
  );
});
