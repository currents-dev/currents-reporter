import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { globPaths } from '../glob';

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

  const sorted = (paths: string[]) => [...paths].sort();

  it('returns the matches of relative patterns relative to the current folder', () => {
    expect(sorted(globPaths(['reports/**/*.xml']))).toEqual([
      'reports/a.xml',
      'reports/b.xml',
      'reports/nested/d.xml',
      'reports/skip.xml',
    ]);
  });

  it('expands brace lists and ranges', () => {
    expect(sorted(globPaths(['reports/{a,b}.xml']))).toEqual([
      'reports/a.xml',
      'reports/b.xml',
    ]);
    expect(sorted(globPaths(['reports/*.{xml,json}']))).toHaveLength(4);
  });

  it('returns the files of a folder', () => {
    expect(sorted(globPaths(['dist']))).toEqual(['dist/a.js', 'dist/sub/b.js']);
  });

  it('matches a dotfile only by its name', () => {
    expect(globPaths(['reports/*.xml'])).not.toContain('reports/.hidden.xml');
    expect(globPaths(['reports/.hidden.xml'])).toEqual(['reports/.hidden.xml']);
  });

  it('returns the matches of absolute patterns as absolute paths', () => {
    expect(sorted(globPaths([path.join(cwd, 'dist')]))).toEqual([
      path.join(cwd, 'dist/a.js'),
      path.join(cwd, 'dist/sub/b.js'),
    ]);
    expect(globPaths([path.join(root, 'outside/*.xml')])).toEqual([
      path.join(root, 'outside/r.xml'),
    ]);
  });

  it('keeps the form of each pattern when relative and absolute are mixed', () => {
    expect(
      sorted(globPaths(['reports/a.xml', path.join(cwd, 'reports/b.xml')]))
    ).toEqual([path.join(cwd, 'reports/b.xml'), 'reports/a.xml']);
  });

  it('leaves out the matches of negated patterns', () => {
    expect(sorted(globPaths(['reports/*.xml', '!reports/skip.xml']))).toEqual([
      'reports/a.xml',
      'reports/b.xml',
    ]);
    expect(
      sorted(
        globPaths([
          path.join(cwd, 'reports/*.xml'),
          '!' + path.join(cwd, 'reports/skip.xml'),
        ])
      )
    ).toEqual([
      path.join(cwd, 'reports/a.xml'),
      path.join(cwd, 'reports/b.xml'),
    ]);
  });

  it('leaves out every file of a negated folder', () => {
    expect(globPaths(['reports/**/*.xml', '!reports/nested'])).not.toContain(
      'reports/nested/d.xml'
    );
  });

  // The cases below are how globby 11 behaved
  it('keeps the files of a folder whose name matches a negated pattern', () => {
    expect(globPaths(['reports/**/*.xml', '!reports/**/n*'])).toContain(
      'reports/nested/d.xml'
    );
  });

  it('applies a negated pattern only to the patterns before it', () => {
    expect(globPaths(['!reports/skip.xml', 'reports/*.xml'])).toContain(
      'reports/skip.xml'
    );
  });

  it('leaves nothing out of an absolute pattern with a relative negation', () => {
    expect(
      globPaths([path.join(cwd, 'reports/*.xml'), '!reports/skip.xml'])
    ).toContain(path.join(cwd, 'reports/skip.xml'));
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

  // GHSA-vfj7-8cjw-p6xm: braces overflowed the stack on deeply nested groups.
  it('handles deeply nested braces', () => {
    const depth = 5000;
    const pattern = '{'.repeat(depth) + 'a' + '}'.repeat(depth) + '.xml';
    expect(globPaths([pattern])).toEqual([]);
  });
});
