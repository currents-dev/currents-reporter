import { describe, expect, it, vi } from 'vitest';
import type { TerminalRunEvent } from '../events';
import { createRunChecks, type RunCheckEvent } from '../runChecks';
import { runCheckLines } from '../runChecksText';

vi.mock('@logger', () => ({ yellow: (s: string) => s }));

const lost = 'Error: ECONNRESET: lost connection to the test database';

/** A run of 120 tests on 12 machines; the tests of `badMachine` take twice as long and every third of them fails with ECONNRESET. */
function fleetEvents(badMachine?: string): TerminalRunEvent[] {
  const events: TerminalRunEvent[] = [
    { type: 'runBegin', totalTests: 120, startedAt: 0 },
  ];
  for (let i = 0; i < 120; i++) {
    const machine = `machine-${(i % 12) + 1}`;
    const bad = machine === badMachine;
    const testId = `t${i}`;
    events.push({
      type: 'testBegin',
      testId,
      title: [`scenario ${i}`],
      file: `area${i % 10}.spec.ts`,
      worker: `${machine}/${i % 4}`,
      retry: 0,
      startedAt: 1_000_000 + i * 1000,
    });
    const fails = (bad && Math.floor(i / 12) % 3 === 0) || i === 33;
    events.push({
      type: 'testEnd',
      testId,
      status: fails ? 'failed' : 'passed',
      durationMs: (bad ? 44_000 : 22_000) + (i % 5) * 500,
      retry: 0,
      error: fails
        ? i === 33
          ? 'Error: cart total is wrong'
          : lost
        : undefined,
      errorDetail: fails
        ? { location: { file: `/w/area${i % 10}.spec.ts`, line: 54 } }
        : undefined,
    });
  }
  // A skipped test and a late `testEnd` for an attempt that already ended.
  events.push(
    {
      type: 'testBegin',
      testId: 'skipped',
      title: ['not ready'],
      file: 'area0.spec.ts',
      worker: 'machine-1/-1',
      retry: 0,
    },
    {
      type: 'testEnd',
      testId: 'skipped',
      status: 'skipped',
      durationMs: 0,
      retry: 0,
    },
    {
      type: 'testEnd',
      testId: 't1',
      status: 'flaky',
      durationMs: 22_500,
      retry: 0,
    },
    { type: 'runEnd', status: 'failed' }
  );
  return events;
}

const run = (events: TerminalRunEvent[]) => {
  const checks = createRunChecks('/w');
  return events.flatMap((event) => checks(event));
};

describe('createRunChecks', () => {
  it('stays quiet on a run with no bad machine', () => {
    const events = run(fleetEvents());
    expect(events).toEqual([]);
  });

  it('flags the bad machine and groups its errors', () => {
    const events = run(fleetEvents('machine-4'));
    const lines = events.flatMap(runCheckLines);
    const warnings = events.filter(
      (e): e is Extract<RunCheckEvent, { type: 'machineWarning' }> =>
        e.type === 'machineWarning'
    );
    expect(warnings.map((w) => w.machineId)).toEqual(['machine-4']);
    expect(lines).toEqual([
      '! same error on 3 tests on 1 machine in 71 s: ECONNRESET: lost connection to the test database (first at area3.spec.ts:54)',
      '! machine machine-4: 3 of 8 tests failed at least once vs 3% on 5 other machines that ran the same spec files; its passed tests take 2.0x as long as the same spec files on other machines; probably the machine, not the code',
      '  3 of 3 failed tests on it have the same error: ECONNRESET: lost connection to the test database',
      '',
      'Most common errors:',
      '  same error on 4 tests on 1 machine in 107 s: ECONNRESET: lost connection to the test database (first at area3.spec.ts:54)',
    ]);
  });
});
