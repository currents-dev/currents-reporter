import fs from 'fs';
import { isAbsolute, resolve } from 'path';
import picomatch from 'picomatch';
import { globSync } from 'tinyglobby';

/**
 * Returns the files that match the glob patterns as globby 11 did, so that
 * replacing it changes no command's results:
 * - an absolute pattern returns absolute paths, a relative one paths relative
 *   to the current folder
 * - a `!pattern` leaves out the files it matches, or the files of a folder it
 *   names, from the patterns before it; a relative one leaves nothing out of
 *   an absolute pattern
 * - files come in pattern order, shallower first. `convert` keeps the last
 *   report of a spec, so the order decides its results.
 */
export function globPaths(patterns: string[]): string[] {
  const negations = patterns.flatMap((pattern, index) =>
    pattern.length > 1 && pattern.startsWith('!')
      ? [toNegation(pattern.slice(1), index)]
      : []
  );
  const matches = new Set<string>();

  patterns.forEach((pattern, index) => {
    if (pattern.startsWith('!')) {
      return;
    }
    // Without the `absolute` option, tinyglobby returns /tmp/r.xml as
    // ../../tmp/r.xml
    const absolute = isAbsolute(pattern);
    const applying = negations.filter(
      (negation) => negation.index > index && (!absolute || negation.absolute)
    );
    // Not tinyglobby's `ignore`: it skips whole folders whose name matches, so
    // `!reports/a*` would also drop reports/a_old/report.xml
    const files = globSync(pattern, { absolute }).filter(
      (file) => !applying.some((negation) => negation.leavesOut(file))
    );
    for (const file of sortByDepth(files)) {
      matches.add(file);
    }
  });
  return [...matches];
}

function toNegation(pattern: string, index: number) {
  const absolute = isAbsolute(pattern);
  const isMatch = picomatch(
    isFolder(pattern) ? `${pattern.replace(/\/$/, '')}/**` : pattern
  );
  return {
    index,
    absolute,
    leavesOut: (file: string) =>
      isMatch(absolute ? resolve(file).replace(/\\/g, '/') : file),
  };
}

function isFolder(pattern: string) {
  if (picomatch.scan(pattern).isGlob) {
    return false;
  }
  try {
    return fs.statSync(resolve(pattern)).isDirectory();
  } catch {
    return false;
  }
}

// globby listed each folder in the order the file system returns it: by
// character code on macOS and Linux, ignoring case on Windows. Comparing whole
// paths instead of one folder name at a time would put a-b/x.xml before
// a/x.xml.
export function sortByDepth(files: string[]) {
  const sortable = files.map((file) => ({
    file,
    segments: (process.platform === 'win32' ? file.toUpperCase() : file).split(
      '/'
    ),
  }));
  sortable.sort(({ segments: sa }, { segments: sb }) => {
    if (sa.length !== sb.length) {
      return sa.length - sb.length;
    }
    const i = sa.findIndex((segment, index) => segment !== sb[index]);
    return i === -1 ? 0 : sa[i] < sb[i] ? -1 : 1;
  });
  return sortable.map(({ file }) => file);
}
