import { describe, expect, it } from 'vitest';
import type { TerminalRunEvent } from '../events';
import { WorkerStatsTracker } from '../workerStats';

const begin = (
  testId: string,
  worker: string,
  startedAt?: number,
  retry = 0
): TerminalRunEvent => ({
  type: 'testBegin',
  testId,
  title: [testId],
  file: 'a.spec.ts',
  worker,
  retry,
  startedAt,
});

const end = (
  testId: string,
  durationMs: number,
  status: 'passed' | 'failed' | 'flaky' | 'skipped' = 'passed',
  retry = 0
): TerminalRunEvent => ({
  type: 'testEnd',
  testId,
  status,
  durationMs,
  retry,
});

describe('WorkerStatsTracker', () => {
  it('counts busy and idle time from the start of the first test to the end of the last', () => {
    const stats = new WorkerStatsTracker();
    stats.add({ type: 'runBegin', totalTests: 3, startedAt: 0 });
    stats.add(begin('a', 'm/0', 1_000));
    stats.add(begin('b', 'm/1', 1_000));
    stats.add(end('a', 9_000));
    stats.add(begin('c', 'm/0', 10_000));
    stats.add(end('b', 2_000));
    stats.add(end('c', 1_000));
    stats.add({ type: 'runEnd', status: 'passed' });

    const result = stats.read();
    expect(result.windowMs).toBe(10_000);
    expect(result.workers).toEqual([
      expect.objectContaining({
        worker: 'm/0',
        tests: 2,
        busyMs: 10_000,
        idleMs: 0,
      }),
      expect.objectContaining({
        worker: 'm/1',
        tests: 1,
        busyMs: 2_000,
        idleMs: 8_000,
      }),
    ]);
    expect(result).toMatchObject({
      totalTests: 3,
      testsDone: 3,
      testsFailed: 0,
      runStatus: 'passed',
    });
  });

  it('counts a running test up to now and shows it as running', () => {
    const stats = new WorkerStatsTracker();
    stats.add(begin('a', 'm/0', 1_000));
    stats.add(begin('b', 'm/1', 2_000));
    stats.add(end('b', 1_000));

    const result = stats.read(5_000);
    expect(result.windowMs).toBe(4_000);
    expect(result.workers[0]).toMatchObject({
      busyMs: 4_000,
      idleMs: 0,
      running: { testId: 'a', startedAt: 1_000 },
    });
    expect(result.workers[1]).toMatchObject({ busyMs: 1_000, idleMs: 3_000 });
    expect(result.workers[1].running).toBeUndefined();
    expect(result.testsDone).toBe(1);
  });

  it('counts the time once when the next test begins before the end of the one before arrives', () => {
    const stats = new WorkerStatsTracker();
    stats.add(begin('a', 'm/0', 0));
    stats.add(begin('b', 'm/0', 4_000));

    const result = stats.read(5_000);
    expect(result.workers[0]).toMatchObject({
      busyMs: 5_000,
      idleMs: 0,
      running: { testId: 'b' },
    });
  });

  it('counts an attempt once when a flaky record sends a second testEnd', () => {
    const stats = new WorkerStatsTracker();
    stats.add(begin('a', 'm/0', 0, 0));
    stats.add(end('a', 1_000, 'failed', 0));
    stats.add(begin('a', 'm/1', 1_000, 1));
    stats.add(end('a', 2_000, 'passed', 1));
    stats.add(end('a', 2_000, 'flaky', 1));

    const result = stats.read();
    expect(result.workers.map((w) => [w.worker, w.tests, w.busyMs])).toEqual([
      ['m/0', 1, 1_000],
      ['m/1', 1, 2_000],
    ]);
    expect(result).toMatchObject({ testsDone: 1, testsFailed: 0 });
  });

  it('leaves out skipped tests and parallel index -1', () => {
    const stats = new WorkerStatsTracker();
    stats.add(begin('a', 'm/-1', 0));
    stats.add(end('a', 0, 'skipped'));
    stats.add(begin('b', 'm/0', 0));
    stats.add(end('b', 0, 'skipped'));
    stats.add(begin('c', 'm/0', 1_000));
    stats.add(end('c', 1_000));

    const result = stats.read();
    expect(result.workers).toHaveLength(1);
    expect(result.workers[0]).toMatchObject({ worker: 'm/0', tests: 1 });
    expect(result.windowMs).toBe(1_000);
    expect(result.testsDone).toBe(3);
  });

  it('uses the time events arrive when they have no start time', () => {
    const stats = new WorkerStatsTracker();
    // A finished run: every event arrives at once.
    stats.add(begin('a', 'm/0'), 10_000);
    stats.add(end('a', 4_000), 10_000);
    stats.add(begin('b', 'm/1'), 10_000);
    stats.add(end('b', 1_000), 10_000);

    const result = stats.read(20_000);
    expect(result.windowMs).toBe(4_000);
    expect(result.workers.map((w) => [w.busyMs, w.idleMs])).toEqual([
      [4_000, 0],
      [1_000, 3_000],
    ]);
  });

  it('stops counting tests that still run when the run ends', () => {
    const stats = new WorkerStatsTracker();
    stats.add(begin('a', 'm/0', 1_000));
    stats.add({ type: 'runEnd', status: 'cancelled' }, 3_000);

    const result = stats.read(60_000);
    expect(result.windowMs).toBe(2_000);
    expect(result.workers[0]).toMatchObject({ busyMs: 2_000 });
    expect(result.workers[0].running).toBeUndefined();
  });

  it('sorts workers by machine, then by parallel index as a number', () => {
    const stats = new WorkerStatsTracker();
    ['b/0', 'a/10', 'a/2'].forEach((worker, i) => {
      stats.add(begin(String(i), worker, 0));
      stats.add(end(String(i), 1_000));
    });
    expect(stats.read().workers.map((w) => w.worker)).toEqual([
      'a/2',
      'a/10',
      'b/0',
    ]);
  });
});
