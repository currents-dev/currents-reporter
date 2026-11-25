import { describe, expect, it, vi } from 'vitest';
import type { RunWorkerStats, WorkerStats } from '../workerStats';
import {
  formatDuration,
  workerSummaryLines,
  workerTableLines,
} from '../workerText';

vi.mock('@logger', () => {
  const plain = (s: string) => s;
  return { dim: plain, green: plain };
});

const worker = (
  parallelIndex: number,
  tests: number,
  busyMs: number,
  idleMs: number,
  machineId = 'm'
): WorkerStats => ({
  worker: `${machineId}/${parallelIndex}`,
  machineId,
  parallelIndex,
  tests,
  busyMs,
  idleMs,
});

const run = (workers: WorkerStats[], windowMs = 100_000): RunWorkerStats => ({
  workers,
  windowMs,
  totalTests: 10,
  testsDone: 10,
  testsFailed: 0,
  runStatus: 'passed',
});

describe('workerSummaryLines', () => {
  it('names the busiest and the most idle worker', () => {
    expect(
      workerSummaryLines(
        run([
          worker(0, 6, 98_000, 2_000),
          worker(1, 3, 50_000, 50_000),
          worker(2, 1, 12_000, 88_000),
        ])
      )
    ).toEqual([
      '3 workers, 1m40s from the first test to the last, busy 53% of the time on average',
      'Busiest: worker 0, 6 tests, busy 1m38s, idle 2s',
      'Most idle: worker 2, 1 test, busy 12s, idle 1m28s',
    ]);
  });

  it('shows the machine when workers run on more than one', () => {
    expect(
      workerSummaryLines(
        run([
          worker(0, 2, 80_000, 20_000, 'a'),
          worker(0, 1, 10_000, 90_000, 'b'),
        ])
      ).slice(1)
    ).toEqual([
      'Busiest: a/0, 2 tests, busy 1m20s, idle 20s',
      'Most idle: b/0, 1 test, busy 10s, idle 1m30s',
    ]);
  });

  it('prints one line for one worker and nothing without workers', () => {
    expect(workerSummaryLines(run([worker(0, 2, 100_000, 0)]))).toEqual([
      '1 worker, 1m40s from the first test to the last, busy 100% of the time on average',
    ]);
    expect(workerSummaryLines(run([]))).toEqual([]);
  });
});

describe('workerTableLines', () => {
  it('prints a row per worker with the running test', () => {
    const busy = {
      ...worker(0, 4, 75_000, 25_000),
      running: {
        testId: 't',
        title: ['cart', 'pays'],
        file: 'cart.spec.ts',
        retry: 1,
        startedAt: 88_000,
      },
    };
    const lines = workerTableLines(
      { ...run([busy, worker(1, 1, 25_000, 75_000)]), runStatus: undefined },
      { columns: 200, rows: 10, now: 100_000 }
    );
    expect(lines).toEqual([
      '10 of 10 tests done, 1 of 2 workers busy, 1m40s, busy 50% on average',
      'worker 0 ███████████████░░░░░  75%   4 tests  cart.spec.ts › cart › pays (retry 1) 12s',
      'worker 1 █████░░░░░░░░░░░░░░░  25%   1 test   idle',
    ]);
  });

  it('cuts rows to the terminal width', () => {
    const lines = workerTableLines(run([worker(0, 4, 75_000, 25_000)]), {
      columns: 30,
      rows: 10,
    });
    expect(lines.every((line) => line.length <= 30)).toBe(true);
    expect(lines[1]).toBe('worker 0 ███████████████░░░░░…');
  });

  it('puts several workers on a row when one row per worker does not fit', () => {
    const workers = Array.from({ length: 30 }, (_, i) =>
      worker(i, 1, 50_000, 50_000)
    );
    const lines = workerTableLines(run(workers), { columns: 93, rows: 11 });
    expect(lines).toHaveLength(11);
    expect(lines[1]).toBe(
      'worker 0  █████░░░░░  50%   1  worker 1  █████░░░░░  50%   1  worker 2  █████░░░░░  50%   1  '
    );
  });

  it('says how many workers did not fit', () => {
    const workers = Array.from({ length: 30 }, (_, i) =>
      worker(i, 1, 50_000, 50_000)
    );
    const lines = workerTableLines(run(workers), { columns: 62, rows: 6 });
    expect(lines).toHaveLength(6);
    expect(lines[5]).toBe('… 22 more workers');
  });
});

describe('formatDuration', () => {
  it('rounds to seconds and adds minutes and hours', () => {
    expect([400, 59_400, 61_000, 3_725_000].map(formatDuration)).toEqual([
      '0s',
      '59s',
      '1m01s',
      '1h02m',
    ]);
  });
});
