import path from 'path';
import { isFailedAttempt, type EndedAttempt } from './endedAttempts';

/** A group of failures is reported when it reaches this many tests, and again each time it doubles. */
export const SPREAD_FIRST_ALERT_TESTS = 3;

export type FailureGroup = {
  /** The first line of the first error of the group, without the `Error: ` prefix. */
  message: string;
  /** Where the first error of the group was thrown, as `file:line`. */
  firstLocation?: string;
  tests: number;
  machines: number;
  /** From the end of the first failed attempt to the end of the latest one, when the records have start times. */
  spanMs?: number;
};

type Group = {
  message: string;
  firstLocation?: string;
  tests: Set<string>;
  machines: Set<string>;
  firstEndedAt?: number;
  lastEndedAt?: number;
  nextAlertTests: number;
};

/**
 * Groups failed attempts that have the same error, across tests and machines,
 * and reports a group each time it grows past a threshold.
 */
export class FailureSpread {
  private groups = new Map<string, Group>();

  constructor(private cwd = process.cwd()) {}

  /** Returns the group of the attempt when it just reached a threshold. */
  add(attempt: EndedAttempt): FailureGroup | undefined {
    if (!isFailedAttempt(attempt) || !attempt.error?.trim()) return;
    const location = attempt.errorDetail?.location;
    const key = errorGroupKey(attempt.error, location);
    let group = this.groups.get(key);
    if (!group) {
      group = {
        message: firstLine(attempt.error).replace(/^Error: /, ''),
        firstLocation: location
          ? `${displayFile(location.file, attempt.file, this.cwd)}:${location.line}`
          : undefined,
        tests: new Set(),
        machines: new Set(),
        nextAlertTests: SPREAD_FIRST_ALERT_TESTS,
      };
      this.groups.set(key, group);
    }
    group.tests.add(attempt.testId);
    group.machines.add(attempt.machineId);
    if (attempt.endedAt !== undefined) {
      group.firstEndedAt = Math.min(
        group.firstEndedAt ?? Infinity,
        attempt.endedAt
      );
      group.lastEndedAt = Math.max(group.lastEndedAt ?? 0, attempt.endedAt);
    }
    if (group.tests.size < group.nextAlertTests) return;
    group.nextAlertTests = group.tests.size * 2;
    return toFailureGroup(group);
  }

  /** Groups of more than one test, the largest first. */
  top(limit: number): FailureGroup[] {
    return [...this.groups.values()]
      .filter((group) => group.tests.size > 1)
      .sort((a, b) => b.tests.size - a.tests.size)
      .slice(0, limit)
      .map(toFailureGroup);
  }
}

/**
 * Errors are the same when their first lines are the same after
 * `normalizeErrorLine`. A first line that is only a matcher or a timeout,
 * such as `expect(received).toBe(expected)`, says nothing about what failed,
 * so for those the location of the error is part of the key too. Other errors
 * are grouped across locations: a lost database connection fails each spec
 * file at a different line.
 */
export function errorGroupKey(
  error: string,
  location?: { file: string; line: number }
) {
  const line = normalizeErrorLine(firstLine(error));
  const text = line.replace(/^\w*Error: /, '');
  const generic =
    text.startsWith('expect(') ||
    /timeout (?:of )?<n> ?ms exceeded/i.test(text);
  return generic && location
    ? `${line}\n${location.file}:${location.line}`
    : line;
}

const ANSI = /\u001b\[[0-9;]*m/g;

/**
 * Replaces the parts of an error line that change from one failure to the
 * next with placeholders: paths, IDs, numbers and timings.
 */
export function normalizeErrorLine(line: string) {
  return (
    line
      .replace(ANSI, '')
      // Paths of two or more parts, such as /tmp/a/b.txt or C:\a\b.
      .replace(/(?:[A-Za-z]:)?(?:[\\/][\w.@+-]+){2,}/g, '<path>')
      .replace(
        /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi,
        '<id>'
      )
      // Hex IDs, and IDs of letters and digits like Currents record IDs.
      .replace(/\b(?=[0-9a-f]*\d)[0-9a-f]{8,}\b/gi, '<id>')
      .replace(/\b(?=[A-Za-z_-]*\d)(?=[\d_-]*[A-Za-z])[\w-]{12,}\b/g, '<id>')
      .replace(/\d+(?:\.\d+)?/g, '<n>')
      .replace(/\s+/g, ' ')
      .trim()
  );
}

function firstLine(error: string) {
  return (
    error
      .replace(ANSI, '')
      .split('\n')
      .find((line) => line.trim())
      ?.trim() ?? ''
  );
}

/** The spec path of the test when the location is in its spec file, otherwise a path relative to `cwd`. */
function displayFile(file: string, specFile: string, cwd: string) {
  if (file === specFile || file.endsWith(`/${specFile}`)) return specFile;
  return path.isAbsolute(file) ? path.relative(cwd, file) : file;
}

function toFailureGroup(group: Group): FailureGroup {
  return {
    message: group.message,
    firstLocation: group.firstLocation,
    tests: group.tests.size,
    machines: group.machines.size,
    spanMs:
      group.firstEndedAt !== undefined && group.lastEndedAt !== undefined
        ? group.lastEndedAt - group.firstEndedAt
        : undefined,
  };
}
