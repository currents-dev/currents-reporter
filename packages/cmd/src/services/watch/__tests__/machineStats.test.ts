import { describe, expect, it } from 'vitest';
import type { TerminalRunEvent } from '../events';
import { finishOrder, raceLanes } from '../machineRace';
import { FAILED_RECENTLY_MS, MachineStatsTracker } from '../machineStats';

const begin = (
  testId: string,
  worker: string,
  startedAt?: number,
  { retry = 0, file = 'a.spec.ts' } = {}
): TerminalRunEvent => ({
  type: 'testBegin',
  testId,
  title: [testId],
  file,
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

describe('MachineStatsTracker', () => {
  it('groups tests, failures and workers by machine', () => {
    const stats = new MachineStatsTracker();
    stats.add({ type: 'runBegin', totalTests: 4, startedAt: 0 }, 0);
    stats.add(begin('a', 'm1/0', 1_000), 1_000);
    stats.add(begin('b', 'm1/1', 1_000), 1_000);
    stats.add(begin('c', 'm2/0', 1_000), 1_000);
    stats.add(end('a', 1_000), 2_000);
    stats.add(end('b', 3_000, 'failed'), 4_000);
    stats.add(end('c', 4_000), 5_000);
    stats.add(begin('d', 'm2/0', 6_000), 6_000);

    const { machines, testsDone } = stats.read(7_000);
    expect(testsDone).toBe(3);
    expect(machines).toEqual([
      expect.objectContaining({
        machineId: 'm1',
        testsDone: 2,
        testsFailed: 1,
        workers: 2,
        averageTestMs: 2_000,
        state: 'failedRecently',
        running: [],
      }),
      expect.objectContaining({
        machineId: 'm2',
        testsDone: 1,
        testsFailed: 0,
        workers: 1,
        averageTestMs: 4_000,
        state: 'running',
        running: [expect.objectContaining({ testId: 'd' })],
      }),
    ]);
    expect(machines[0].relativeTestTime).toBeCloseTo(2_000 / 3_000);
    expect(machines[1].relativeTestTime).toBeCloseTo(4_000 / 3_000);
  });

  it('shows a failure for a while, then the machine as idle, and done once the run ended', () => {
    const stats = new MachineStatsTracker();
    stats.add(begin('a', 'm/0', 0), 0);
    stats.add(end('a', 1_000, 'failed'), 1_000);
    expect(stats.read(1_000 + FAILED_RECENTLY_MS - 1).machines[0].state).toBe(
      'failedRecently'
    );
    expect(stats.read(1_000 + FAILED_RECENTLY_MS).machines[0].state).toBe(
      'idle'
    );
    stats.add({ type: 'runEnd', status: 'failed' }, 20_000);
    expect(stats.read(20_000).machines[0].state).toBe('done');
  });

  it('records when a step or test last ended on a machine, by arrival time', () => {
    const stats = new MachineStatsTracker();
    stats.add(begin('a', 'm/0', 0), 100);
    expect(stats.read(100).machines[0].lastActivityAt).toBeUndefined();
    stats.add(
      { type: 'stepEnd', testId: 'a', stepId: 's', durationMs: 5 },
      500
    );
    expect(stats.read(500).machines[0].lastActivityAt).toBe(500);
  });

  it('counts a flaky test once, and a retried test on the machine of its last attempt', () => {
    const stats = new MachineStatsTracker();
    stats.add(begin('a', 'm1/0', 0), 0);
    stats.add(end('a', 1_000, 'failed'), 1_000);
    stats.add(begin('a', 'm2/0', 2_000, { retry: 1 }), 2_000);
    stats.add(end('a', 1_000, 'passed', 1), 3_000);
    // The record is marked flaky after its last attempt ended.
    stats.add(end('a', 1_000, 'flaky', 1), 3_500);

    const [m1, m2] = stats.read(4_000).machines;
    expect(m1).toMatchObject({ testsDone: 0, testsFailed: 0 });
    expect(m2).toMatchObject({ testsDone: 1, testsFailed: 0 });
    expect(m2.averageTestMs).toBe(1_000);
  });

  it('counts skipped tests as done without using them for test time', () => {
    const stats = new MachineStatsTracker();
    stats.add(begin('a', 'm/0', 0), 0);
    stats.add(end('a', 2_000), 2_000);
    stats.add(begin('b', 'm/-1', 2_000), 2_000);
    stats.add(end('b', 0, 'skipped'), 2_000);
    const [m] = stats.read(3_000).machines;
    expect(m.testsDone).toBe(2);
    expect(m.averageTestMs).toBe(2_000);
  });

  it('finds the spec file each machine spent the most time on', () => {
    const stats = new MachineStatsTracker();
    stats.add(begin('a', 'm/0', 0, { file: 'x.spec.ts' }), 0);
    stats.add(begin('b', 'm/1', 0, { file: 'y.spec.ts' }), 0);
    stats.add(begin('c', 'm/1', 0, { file: 'x.spec.ts' }), 0);
    stats.add(end('a', 3_000), 3_000);
    stats.add(end('b', 4_000), 4_000);
    stats.add(end('c', 2_000), 4_000);
    expect(stats.read(5_000).machines[0].longestSpec).toEqual({
      file: 'x.spec.ts',
      durationMs: 5_000,
    });
  });
});

describe('raceLanes', () => {
  it('makes a lane as long as an even share of the tests while the run goes on', () => {
    const stats = new MachineStatsTracker();
    stats.add({ type: 'runBegin', totalTests: 8, startedAt: 0 }, 0);
    stats.add(begin('a', 'm1/0', 0), 0);
    stats.add(end('a', 1_000), 1_000);
    stats.add(begin('b', 'm2/0', 0), 0);
    expect(
      raceLanes(stats.read(1_000)).map((l) => [l.machine.machineId, l.position])
    ).toEqual([
      ['m1', 0.25],
      ['m2', 0],
    ]);
  });

  it('makes a lane longer when a machine did more than an even share', () => {
    const stats = new MachineStatsTracker();
    stats.add({ type: 'runBegin', totalTests: 2, startedAt: 0 }, 0);
    ['a', 'b', 'c'].forEach((id) => {
      stats.add(begin(id, 'm1/0', 0), 0);
      stats.add(end(id, 1), 0);
    });
    stats.add(begin('d', 'm2/0', 0), 0);
    expect(raceLanes(stats.read(1)).map((l) => l.position)).toEqual([1, 0]);
  });

  it("uses each machine's own total once the run ended", () => {
    const stats = new MachineStatsTracker();
    stats.add({ type: 'runBegin', totalTests: 8, startedAt: 0 }, 0);
    stats.add(begin('a', 'm1/0', 0), 0);
    stats.add(end('a', 1_000), 1_000);
    stats.add({ type: 'runEnd', status: 'passed' }, 2_000);
    expect(raceLanes(stats.read(2_000))).toEqual([
      expect.objectContaining({ position: 1, total: 1 }),
    ]);
  });
});

describe('finishOrder', () => {
  it('orders machines by the end of their last test, by the clock of the machines', () => {
    const stats = new MachineStatsTracker();
    // All events arrive at once, as when a finished run is watched.
    stats.add(begin('a', 'slow/0', 1_000), 99_000);
    stats.add(end('a', 9_000), 99_000);
    stats.add(begin('b', 'fast/0', 1_000), 99_000);
    stats.add(end('b', 2_000), 99_000);
    expect(
      finishOrder(stats.read(99_000)).map((f) => [
        f.machine.machineId,
        f.finishedAfterMs,
      ])
    ).toEqual([
      ['fast', 2_000],
      ['slow', 9_000],
    ]);
  });
});
