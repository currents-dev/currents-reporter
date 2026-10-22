import { isAbsolute } from 'path';
import { globSync } from 'tinyglobby';

/**
 * Returns the files that match the glob patterns, pattern by pattern and
 * sorted within each, without duplicates. A `!pattern` leaves its matches out
 * of every pattern.
 */
export function globPaths(globs: string[]): string[] {
  const patterns = globs.map(expandNumericRanges);
  const ignore = patterns
    .filter((pattern) => pattern.startsWith('!'))
    .map((pattern) => pattern.slice(1));
  const files = patterns
    .filter((pattern) => !pattern.startsWith('!'))
    .flatMap((pattern) =>
      // Without `absolute`, tinyglobby returns /tmp/r.xml as ../../tmp/r.xml
      globSync(pattern, { absolute: isAbsolute(pattern), ignore }).sort()
    );
  return [...new Set(files)];
}

const NUMERIC_RANGE = /(?<!\\)\{(-?\d+)\.\.(-?\d+)(?:\.\.(-?\d+))?\}/g;
// globby (through braces) refused to expand a range with more values
const MAX_RANGE_VALUES = 1000;

// tinyglobby reads {1..10} as the character class [1-10], which matches only
// 0 and 1, and matches nothing for {01..03}
function expandNumericRanges(pattern: string) {
  return pattern.replace(NUMERIC_RANGE, (_, from, to, step) => {
    const values = numericRange(from, to, step);
    return values.length === 1 ? values[0] : `{${values.join(',')}}`;
  });
}

// Same values as braces: a step of 0 counts as 1, and a bound written with a
// leading zero pads every value to the longest bound
function numericRange(from: string, to: string, step = '1') {
  const start = Number(from);
  const end = Number(to);
  const size = Math.abs(Number(step)) || 1;
  const count = Math.floor(Math.abs(end - start) / size) + 1;
  if (count > MAX_RANGE_VALUES) {
    throw new Error(
      `{${from}..${to}} expands to more than ${MAX_RANGE_VALUES} values`
    );
  }
  const direction = start <= end ? 1 : -1;
  const padded = [from, to].some((bound) => /^-?0\d/.test(bound));
  const width = padded ? Math.max(from.length, to.length) : 0;
  return Array.from({ length: count }, (_, i) => {
    const value = start + i * direction * size;
    const sign = value < 0 ? '-' : '';
    return sign + String(Math.abs(value)).padStart(width - sign.length, '0');
  });
}
