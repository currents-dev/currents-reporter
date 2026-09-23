import { InstanceReport } from '../../types';
import { mergeInstanceReport } from '../mergeInstanceReport';

const attempt = (status: 'passed' | 'failed', attemptNumber: number) => ({
  _s: status,
  attempt: attemptNumber,
  startTime: '2026-09-22T07:24:35.079Z',
  steps: [],
  duration: 10,
  status,
  stderr: [],
  stdout: [],
  errors: [],
});

const report = (overrides: {
  state: 'passed' | 'failed';
  attempts: ReturnType<typeof attempt>[];
  startTime: string;
  endTime: string;
}): InstanceReport =>
  ({
    groupId: 'root',
    spec: 'e2e/transfer.test.js',
    startTime: overrides.startTime,
    results: {
      stats: {
        suites: 1,
        tests: 1,
        passes: overrides.state === 'passed' ? 1 : 0,
        pending: 0,
        skipped: 0,
        failures: overrides.state === 'failed' ? 1 : 0,
        flaky: 0,
        wallClockStartedAt: overrides.startTime,
        wallClockEndedAt: overrides.endTime,
        wallClockDuration: 10,
      },
      tests: [
        {
          _t: +new Date(overrides.startTime),
          testId: 'test-1',
          title: ['transfer', 'sends coins'],
          state: overrides.state,
          retries: overrides.attempts.length,
          timeout: 0,
          location: { column: 1, file: 'e2e/transfer.test.js', line: 1 },
          attempts: overrides.attempts,
        },
      ],
    },
  }) as unknown as InstanceReport;

describe('mergeInstanceReport', () => {
  const first = report({
    state: 'failed',
    attempts: [attempt('failed', 0)],
    startTime: '2026-09-22T07:24:30.000Z',
    endTime: '2026-09-22T07:24:31.000Z',
  });

  const rerun = report({
    state: 'passed',
    attempts: [attempt('passed', 0)],
    startTime: '2026-09-22T07:25:30.000Z',
    endTime: '2026-09-22T07:25:31.000Z',
  });

  it('appends the attempts of the rerun after the ones already reported', () => {
    const merged = mergeInstanceReport(first, rerun);
    const [test] = merged.results.tests;

    expect(test.attempts.map((a) => [a.attempt, a.status])).toEqual([
      [0, 'failed'],
      [1, 'passed'],
    ]);
    expect(test.retries).toBe(2);
  });

  it('takes the outcome of the rerun and marks the test flaky', () => {
    const merged = mergeInstanceReport(first, rerun);
    const [test] = merged.results.tests;

    expect(test.state).toBe('passed');
    expect(test.isFlaky).toBe(true);
    expect(merged.results.stats.passes).toBe(1);
    expect(merged.results.stats.failures).toBe(0);
    expect(merged.results.stats.flaky).toBe(1);
  });

  it('spans the wall clock of both runs', () => {
    const merged = mergeInstanceReport(first, rerun);

    expect(merged.startTime).toBe('2026-09-22T07:24:30.000Z');
    expect(merged.results.stats.wallClockStartedAt).toBe(
      '2026-09-22T07:24:30.000Z'
    );
    expect(merged.results.stats.wallClockEndedAt).toBe(
      '2026-09-22T07:25:31.000Z'
    );
    expect(merged.results.stats.wallClockDuration).toBe(20);
  });

  it('keeps a test the rerun did not run', () => {
    const merged = mergeInstanceReport(first, {
      ...rerun,
      results: { ...rerun.results, tests: [] },
    });

    expect(merged.results.tests).toHaveLength(1);
    expect(merged.results.tests[0].attempts).toHaveLength(1);
  });

  it('counts a skipped test that both runs reported once', () => {
    const withSkipped = (base: InstanceReport): InstanceReport => ({
      ...base,
      results: {
        ...base.results,
        stats: { ...base.results.stats, skipped: 1 },
        tests: [
          ...base.results.tests,
          { ...base.results.tests[0], testId: 'test-2', state: 'pending' },
        ],
      },
    });

    const merged = mergeInstanceReport(withSkipped(first), withSkipped(rerun));

    expect(merged.results.stats.skipped).toBe(1);
    expect(merged.results.stats.pending).toBe(0);
  });
});
