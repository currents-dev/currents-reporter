import { describe, expect, it } from 'vitest';
import type { EndedAttempt } from '../endedAttempts';
import {
  errorGroupKey,
  FailureSpread,
  normalizeErrorLine,
} from '../failureSpread';

const failed = (
  testId: string,
  machineId: string,
  error: string,
  over: Partial<EndedAttempt> = {}
): EndedAttempt => ({
  testId,
  retry: 0,
  machineId,
  file: 'cart.spec.ts',
  status: 'failed',
  durationMs: 1000,
  error,
  ...over,
});

describe('normalizeErrorLine', () => {
  it('replaces colors, paths, IDs, numbers and timings', () => {
    expect(
      normalizeErrorLine(
        '\u001b[31mError: read ECONNRESET 10.0.0.7:5432 after 1500ms in /tmp/run/db.sock for 6ZUmcBVrOXohk7an and 3f2b9c0de1a4\u001b[39m'
      )
    ).toBe(
      'Error: read ECONNRESET <n>.<n>:<n> after <n>ms in <path> for <id> and <id>'
    );
  });
});

describe('errorGroupKey', () => {
  const at = (file: string, line: number) => ({ file, line });

  it('groups an error with text of its own across locations', () => {
    expect(
      errorGroupKey(
        'Error: ECONNRESET: lost connection',
        at('/w/tests/login.spec.ts', 54)
      )
    ).toBe(
      errorGroupKey(
        'Error: ECONNRESET: lost connection',
        at('/w/tests/inbox.spec.ts', 54)
      )
    );
  });

  it('keeps bare matcher and timeout errors at different locations apart', () => {
    const matcher =
      'Error: expect(received).toBe(expected) // Object.is equality\n\nExpected: 2\nReceived: 1';
    expect(errorGroupKey(matcher, at('a.spec.ts', 10))).not.toBe(
      errorGroupKey(matcher, at('b.spec.ts', 20))
    );
    expect(errorGroupKey(matcher, at('a.spec.ts', 10))).toBe(
      errorGroupKey(matcher.replace('2', '3'), at('a.spec.ts', 10))
    );
    const timeout = 'Test timeout of 30000ms exceeded.';
    expect(errorGroupKey(timeout, at('a.spec.ts', 1))).not.toBe(
      errorGroupKey(timeout, at('b.spec.ts', 1))
    );
  });
});

describe('FailureSpread', () => {
  const lost = 'Error: ECONNRESET: lost connection to the test database';

  it('reports a group at 3 tests and again each time it doubles', () => {
    const spread = new FailureSpread('/w');
    const reports = [];
    for (let i = 0; i < 12; i++) {
      reports.push(
        spread.add(
          failed(`t${i}`, `m${i % 5}`, lost, {
            endedAt: 1_000_000 + i * 5_000,
            errorDetail: {
              location: { file: '/w/tests/cart.spec.ts', line: 30 },
            },
            file: 'tests/cart.spec.ts',
          })
        )
      );
    }
    const reported = reports.flatMap((r, i) => (r ? [[i + 1, r]] : []));
    expect(reported.map(([tests]) => tests)).toEqual([3, 6, 12]);
    expect(reported[0][1]).toEqual({
      message: 'ECONNRESET: lost connection to the test database',
      firstLocation: 'tests/cart.spec.ts:30',
      tests: 3,
      machines: 3,
      spanMs: 10_000,
    });
  });

  it('counts a test that fails on each retry once, and ignores passed tests', () => {
    const spread = new FailureSpread();
    expect(spread.add(failed('t1', 'm1', lost))).toBeUndefined();
    expect(spread.add(failed('t1', 'm1', lost, { retry: 1 }))).toBeUndefined();
    expect(
      spread.add(failed('t2', 'm1', lost, { status: 'passed' }))
    ).toBeUndefined();
    expect(spread.add(failed('t2', 'm1', lost))).toBeUndefined();
    expect(spread.top(5)).toEqual([
      expect.objectContaining({ tests: 2, machines: 1, spanMs: undefined }),
    ]);
  });

  it('lists the largest groups first and leaves out single failures', () => {
    const spread = new FailureSpread();
    spread.add(failed('t1', 'm1', 'Error: invoice row is missing'));
    ['t2', 't3'].forEach((t) => spread.add(failed(t, 'm1', 'Error: a 1')));
    ['t4', 't5', 't6'].forEach((t) =>
      spread.add(failed(t, 'm2', 'Error: b 2'))
    );
    expect(spread.top(5).map((g) => [g.message, g.tests])).toEqual([
      ['b 2', 3],
      ['a 1', 2],
    ]);
  });
});
