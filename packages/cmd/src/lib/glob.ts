import { isAbsolute, resolve } from 'path';
import { globSync } from 'tinyglobby';

/**
 * Returns the files that match the glob patterns, the way globby 11 returned
 * them, so that switching from globby changes no command's results:
 * - a match of an absolute pattern is an absolute path, and a match of a
 *   relative pattern is relative to the current folder. tinyglobby alone
 *   returns every match relative to the current folder, so
 *   `--input-file /tmp/r.xml` would print as `../../tmp/r.xml`.
 * - a `!pattern` leaves out the files whose path matches it, or every file of
 *   a folder it names, from the patterns before it, and a relative `!pattern`
 *   leaves nothing out of an absolute pattern's matches. tinyglobby's `ignore`
 *   skips whole folders whose name matches, so `!**\/a*` would also drop
 *   `a_/report.xml`.
 * - the matches of each pattern come in the order of the patterns, shallower
 *   files first. When two reports hold the same spec, `convert` keeps the one
 *   it reads last, so a different order changes the converted results.
 */
export function globPaths(patterns: string[]): string[] {
  const matches = new Set<string>();

  patterns.forEach((pattern, index) => {
    if (pattern.startsWith('!')) {
      return;
    }
    const left = new Set(
      patterns
        .slice(index + 1)
        .filter((p) => p.startsWith('!'))
        .map((p) => p.slice(1))
        // globby matched a relative !pattern against the absolute paths an
        // absolute pattern returns, so it never left anything out of them
        .filter((p) => !isAbsolute(pattern) || isAbsolute(p))
        .flatMap((p) => globSync(p, { absolute: true }))
    );
    const files = globSync(pattern, { absolute: isAbsolute(pattern) }).filter(
      (file) => !left.has(resolve(file).replace(/\\/g, '/'))
    );
    for (const file of sortByDepth(files)) {
      matches.add(file);
    }
  });
  return [...matches];
}

// globby listed each folder in the order the file system returns it: by
// character code on macOS and Linux, ignoring case on Windows. Comparing whole
// paths instead of one folder name at a time would put a-b/x.xml before
// a/x.xml.
function sortByDepth(files: string[]) {
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
