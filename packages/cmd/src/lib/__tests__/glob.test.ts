import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { posixJoin } from '../../test-utils/path';
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
      'reports/1.xml',
      'reports/2.xml',
      'reports/10.xml',
      'reports/01.xml',
      'reports/03.xml',
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

  it('returns the matches sorted, relative to the current folder', () => {
    expect(globPaths(['reports/**/[a-z].xml'])).toEqual([
      'reports/a.xml',
      'reports/b.xml',
      'reports/nested/d.xml',
    ]);
  });

  it('returns the matches of each pattern in pattern order, once', () => {
    expect(globPaths(['reports/b.xml', 'reports/[ab].xml'])).toEqual([
      'reports/b.xml',
      'reports/a.xml',
    ]);
  });

  it('returns the files of a folder', () => {
    expect(globPaths(['dist'])).toEqual(['dist/a.js', 'dist/sub/b.js']);
  });

  it('matches a dotfile only by its name', () => {
    expect(globPaths(['reports/*.xml'])).not.toContain('reports/.hidden.xml');
    expect(globPaths(['reports/.hidden.xml'])).toEqual(['reports/.hidden.xml']);
  });

  it('returns the matches of absolute patterns as absolute paths', () => {
    expect(globPaths([posixJoin(cwd, 'dist')])).toEqual([
      posixJoin(cwd, 'dist/a.js'),
      posixJoin(cwd, 'dist/sub/b.js'),
    ]);
    expect(globPaths([posixJoin(root, 'outside/*.xml')])).toEqual([
      posixJoin(root, 'outside/r.xml'),
    ]);
  });

  it('expands brace lists', () => {
    expect(globPaths(['reports/{a,c}.{xml,json}'])).toEqual([
      'reports/a.xml',
      'reports/c.json',
    ]);
  });

  it.each([
    ['reports/{1..10}.xml', ['1', '10', '2']],
    ['reports/{2..1}.xml', ['1', '2']],
    ['reports/{01..03}.xml', ['01', '03']],
    ['reports/{1..10..9}.xml', ['1', '10']],
  ])('expands the numeric range in %s', (pattern, names) => {
    expect(globPaths([pattern])).toEqual(
      names.map((name) => `reports/${name}.xml`)
    );
  });

  it('refuses a numeric range of more than 1000 values, like globby', () => {
    expect(() => globPaths(['reports/{1..2000}.xml'])).toThrow(
      'more than 1000 values'
    );
  });

  it('leaves out the matches of a negated pattern from every pattern', () => {
    expect(
      globPaths(['reports/[as]*.xml', '!reports/skip.xml', 'reports/s*.xml'])
    ).toEqual(['reports/a.xml']);
  });

  it('leaves out the files of a negated folder', () => {
    expect(globPaths(['reports/**/*.xml', '!reports/nested'])).not.toContain(
      'reports/nested/d.xml'
    );
  });

  // An empty pattern is what a trailing comma in --input-file leaves
  it('matches nothing for an empty pattern or one with no match', () => {
    expect(globPaths(['reports/a.xml', '', 'nope/*.xml'])).toEqual([
      'reports/a.xml',
    ]);
  });

  // GHSA-vfj7-8cjw-p6xm: braces overflowed the stack on deeply nested groups
  it('handles deeply nested braces', () => {
    const depth = 5000;
    const pattern = '{'.repeat(depth) + 'a' + '}'.repeat(depth) + '.xml';
    expect(globPaths([pattern])).toEqual([]);
  });
});
