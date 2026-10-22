import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { globPaths, sortByDepth } from '../glob';

// Glob patterns use / on every platform, and globPaths returns / paths
const posix = (...parts: string[]) => path.join(...parts).replace(/\\/g, '/');
const sorted = (paths: string[]) => [...paths].sort();

describe('globPaths', () => {
  let root: string;
  let cwd: string;

  beforeEach(() => {
    root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'glob-')));
    cwd = path.join(root, 'project');
    for (const file of [
      'reports/a.xml',
      'reports/b.xml',
      'reports/c.json',
      'reports/skip.xml',
      'reports/.hidden.xml',
      'reports/nested/d.xml',
      'dist/a.js',
      'dist/sub/b.js',
    ]) {
      fs.outputFileSync(path.join(cwd, file), file);
    }
    fs.outputFileSync(path.join(root, 'outside/r.xml'), 'r');
    vi.spyOn(process, 'cwd').mockReturnValue(cwd);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.removeSync(root);
  });

  it('returns the matches of relative patterns relative to the current folder', () => {
    expect(sorted(globPaths(['reports/**/*.xml']))).toEqual([
      'reports/a.xml',
      'reports/b.xml',
      'reports/nested/d.xml',
      'reports/skip.xml',
    ]);
  });

  it('expands brace lists', () => {
    expect(sorted(globPaths(['reports/{a,c}.{xml,json}']))).toEqual([
      'reports/a.xml',
      'reports/c.json',
    ]);
  });

  it('returns the files of a folder', () => {
    expect(sorted(globPaths(['dist']))).toEqual(['dist/a.js', 'dist/sub/b.js']);
  });

  it('matches a dotfile only by its name', () => {
    expect(globPaths(['reports/*.xml'])).not.toContain('reports/.hidden.xml');
    expect(globPaths(['reports/.hidden.xml'])).toEqual(['reports/.hidden.xml']);
  });

  it('returns the matches of absolute patterns as absolute paths', () => {
    expect(sorted(globPaths([posix(cwd, 'dist')]))).toEqual([
      posix(cwd, 'dist/a.js'),
      posix(cwd, 'dist/sub/b.js'),
    ]);
    expect(globPaths([posix(root, 'outside/*.xml')])).toEqual([
      posix(root, 'outside/r.xml'),
    ]);
  });

  it('keeps the form of each pattern when relative and absolute are mixed', () => {
    expect(
      sorted(globPaths(['reports/a.xml', posix(cwd, 'reports/b.xml')]))
    ).toEqual([posix(cwd, 'reports/b.xml'), 'reports/a.xml']);
  });

  it('leaves out the matches of negated patterns', () => {
    expect(sorted(globPaths(['reports/*.xml', '!reports/skip.xml']))).toEqual([
      'reports/a.xml',
      'reports/b.xml',
    ]);
  });

  // How globby 11 applied negated patterns. The rows are functions because
  // cwd is only set in beforeEach.
  it.each([
    [
      'leaves out every file of a negated folder',
      () => ['reports/**/*.xml', '!reports/nested'],
      () => 'reports/nested/d.xml',
      false,
    ],
    [
      'keeps the files of a folder whose name matches a negated pattern',
      () => ['reports/**/*.xml', '!reports/**/n*'],
      () => 'reports/nested/d.xml',
      true,
    ],
    [
      'applies a negated pattern only to the patterns before it',
      () => ['!reports/skip.xml', 'reports/*.xml'],
      () => 'reports/skip.xml',
      true,
    ],
    [
      'applies an absolute negated pattern to a relative one',
      () => ['reports/*.xml', `!${posix(cwd, 'reports/skip.xml')}`],
      () => 'reports/skip.xml',
      false,
    ],
    [
      'applies an absolute negated pattern to an absolute one',
      () => [posix(cwd, 'reports/*.xml'), `!${posix(cwd, 'reports/skip.xml')}`],
      () => posix(cwd, 'reports/skip.xml'),
      false,
    ],
    [
      'leaves nothing out of an absolute pattern with a relative negation',
      () => [posix(cwd, 'reports/*.xml'), '!reports/skip.xml'],
      () => posix(cwd, 'reports/skip.xml'),
      true,
    ],
  ])('%s', (_, patterns, file, kept) => {
    expect(globPaths(patterns()).includes(file())).toBe(kept);
  });

  // convert keeps the last report of a spec, so the order decides the results
  it('returns the matches in pattern order, shallower files first', () => {
    expect(globPaths(['reports/**/*.xml'])).toEqual([
      'reports/a.xml',
      'reports/b.xml',
      'reports/skip.xml',
      'reports/nested/d.xml',
    ]);
    expect(globPaths(['reports/skip.xml', 'reports/*.xml'])).toEqual([
      'reports/skip.xml',
      'reports/a.xml',
      'reports/b.xml',
    ]);
  });

  it('returns nothing for a pattern that matches no file', () => {
    expect(globPaths(['nope/*.xml'])).toEqual([]);
  });

  // globby 11 matched every file in the current folder for an empty pattern,
  // so a trailing comma in --input-file made convert read all of them
  it('matches nothing for an empty pattern', () => {
    expect(globPaths(['reports/a.xml', ''])).toEqual(['reports/a.xml']);
  });

  // GHSA-vfj7-8cjw-p6xm: braces overflowed the stack on deeply nested groups
  it('handles deeply nested braces', () => {
    const depth = 5000;
    const pattern = '{'.repeat(depth) + 'a' + '}'.repeat(depth) + '.xml';
    expect(globPaths([pattern])).toEqual([]);
  });
});

describe('sortByDepth', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sorts one folder name at a time', () => {
    expect(sortByDepth(['a-b/x.xml', 'a/x.xml'])).toEqual([
      'a/x.xml',
      'a-b/x.xml',
    ]);
  });

  it('sorts by character code on macOS and Linux', () => {
    vi.spyOn(process, 'platform', 'get').mockReturnValue('linux');
    expect(sortByDepth(['z.xml', 'a.xml', 'UPPER.xml'])).toEqual([
      'UPPER.xml',
      'a.xml',
      'z.xml',
    ]);
  });

  it('sorts ignoring case on Windows, like its file system', () => {
    vi.spyOn(process, 'platform', 'get').mockReturnValue('win32');
    expect(sortByDepth(['z.xml', 'a.xml', 'UPPER.xml'])).toEqual([
      'a.xml',
      'UPPER.xml',
      'z.xml',
    ]);
  });
});
