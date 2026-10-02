import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { filterPaths, getUploadPaths } from '../path';

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
