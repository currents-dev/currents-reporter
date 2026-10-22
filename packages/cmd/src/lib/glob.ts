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
export function globPaths(globs: string[]): string[] {
  const patterns = globs.flatMap(expandNumericRanges);
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

const NUMERIC_RANGE = /(?<!\\)\{(-?\d+)\.\.(-?\d+)(?:\.\.(-?\d+))?\}/;
// globby (through braces) refused to expand a range with more values than this
const MAX_RANGE_VALUES = 1000;

// globby expanded {1..10} to 1, 2, ..., 10, while picomatch reads it as the
// character class [1-10], which matches only 0 and 1, and matches nothing for
// {01..03}. Like globby, values that name different files or folders become
// one pattern each, read in the range's order; values in one folder become a
// single list pattern, matched in one walk of that folder.
function expandNumericRanges(pattern: string): string[] {
  const expanded = writeOutRanges(pattern);
  const folders = new Set(expanded.map((p) => picomatch.scan(p).base));
  if (expanded.length > 1 && !pattern.startsWith('!') && folders.size > 1) {
    return expanded;
  }
  return [
    pattern.replace(new RegExp(NUMERIC_RANGE, 'g'), (_, from, to, step) => {
      const values = numericRange(from, to, step);
      return values.length === 1 ? values[0] : `{${values.join(',')}}`;
    }),
  ];
}

function writeOutRanges(pattern: string): string[] {
  const range = NUMERIC_RANGE.exec(pattern);
  if (!range) {
    return [pattern];
  }
  const [text, from, to, step] = range;
  return numericRange(from, to, step).flatMap((value) =>
    writeOutRanges(
      pattern.slice(0, range.index) +
        value +
        pattern.slice(range.index + text.length)
    )
  );
}

// Same values as braces: a step of 0 counts as 1, and a bound written with a
// leading zero pads every value to the longest bound
function numericRange(from: string, to: string, step = '1') {
  const start = Number(from);
  const end = Number(to);
  const size = Math.abs(Number(step)) || 1;
  if (Math.abs(end - start) / size >= MAX_RANGE_VALUES) {
    throw new Error(
      `{${from}..${to}} expands to more than ${MAX_RANGE_VALUES} values`
    );
  }
  const padded = [from, to].some((bound) => /^-?0\d/.test(bound));
  const width = Math.max(from.length, to.length);
  const values: string[] = [];
  for (
    let value = start;
    start <= end ? value <= end : value >= end;
    value += start <= end ? size : -size
  ) {
    const digits = String(Math.abs(value));
    values.push(
      (value < 0 ? '-' : '') +
        (padded ? digits.padStart(width - (value < 0 ? 1 : 0), '0') : digits)
    );
  }
  return values;
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
