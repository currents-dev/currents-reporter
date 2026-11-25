import { describe, expect, it } from 'vitest';
import {
  estimateMachineCounts,
  estimateWallMs,
  longestFirst,
} from '../machineCount';
import type { EndedAttempt } from '../workerStats';

const MIN = 60_000;

/** One test per spec, on `<machine>/0`. */
const spec = (
  file: string,
  machineId: string,
  durationMs: number,
  parallelIndex = 0
): EndedAttempt => ({
  testId: `${file}#1`,
  file,
  machineId,
  parallelIndex,
  durationMs,
});

describe('longestFirst', () => {
  it('puts the longest durations first, each on the least loaded bin', () => {
    expect(longestFirst([1, 2, 3, 4, 5], 2)).toEqual([8, 7]);
  });
});

describe('estimateWallMs', () => {
  it('moves units to machines whole and spreads their durations over the workers', () => {
    // Two units of 4 + 4: one per machine, each on 2 workers.
    expect(
      estimateWallMs(
        [
          [4, 4],
          [4, 4],
        ],
        2,
        2
      )
    ).toBe(4);
    // On one machine of 2 workers.
    expect(
      estimateWallMs(
        [
          [4, 4],
          [4, 4],
        ],
        1,
        2
      )
    ).toBe(8);
  });
});

describe('estimateMachineCounts', () => {
  it('finds fewer machines that keep the same wall time', () => {
    // 4 specs of 1 min and 4 of 3 s on 8 machines: on 4 machines, each runs
    // one of each, 1 min 3 s.
    const attempts = Array.from({ length: 8 }, (_, i) =>
      spec(`s${i}.spec.ts`, `m${i}`, i < 4 ? MIN : MIN / 20)
    );
    const estimate = estimateMachineCounts(attempts)!;
    expect(estimate.unit).toBe('spec');
    expect(estimate.machines).toBe(8);
    expect(estimate.currentMs).toBe(MIN);
    expect(estimate.fewer).toEqual({ machines: 4, wallMs: MIN * 1.05 });
    expect(estimate.more).toBeUndefined();
  });

  it('suggests more machines when the work spreads', () => {
    const attempts = Array.from({ length: 8 }, (_, i) =>
      spec(`s${i}.spec.ts`, `m${i % 2}`, MIN)
    );
    const estimate = estimateMachineCounts(attempts)!;
    expect(estimate.currentMs).toBe(4 * MIN);
    expect(estimate.fewer).toBeUndefined();
    expect(estimate.more).toEqual({ machines: 4, wallMs: 2 * MIN });
  });

  it('suggests no more machines when one long spec sets the wall time', () => {
    const attempts = [
      spec('long.spec.ts', 'm0', 10 * MIN),
      ...Array.from({ length: 6 }, (_, i) =>
        spec(`s${i}.spec.ts`, `m${1 + (i % 2)}`, MIN)
      ),
    ];
    const estimate = estimateMachineCounts(attempts)!;
    expect(estimate.currentMs).toBe(10 * MIN);
    expect(estimate.longestUnitMs).toBe(10 * MIN);
    expect(estimate.more).toBeUndefined();
    expect(estimate.fewer).toEqual({ machines: 2, wallMs: 10 * MIN });
  });

  it('moves single tests when a spec ran on more than one machine', () => {
    const attempts: EndedAttempt[] = [
      { ...spec('a.spec.ts', 'm0', 2 * MIN), testId: 'a1' },
      { ...spec('a.spec.ts', 'm1', 2 * MIN), testId: 'a2' },
      { ...spec('a.spec.ts', 'm0', 2 * MIN), testId: 'a3' },
      { ...spec('a.spec.ts', 'm1', 2 * MIN), testId: 'a4' },
    ];
    const estimate = estimateMachineCounts(attempts)!;
    expect(estimate.unit).toBe('test');
    expect(estimate.currentMs).toBe(4 * MIN);
    expect(estimate.more).toEqual({ machines: 4, wallMs: 2 * MIN });
  });

  it('counts the workers of a machine and the retries of a test', () => {
    // One machine of 2 workers; a spec whose tests ran on both workers.
    const attempts: EndedAttempt[] = [
      { ...spec('a.spec.ts', 'm0', MIN, 0), testId: 'a1' },
      { ...spec('a.spec.ts', 'm0', MIN, 1), testId: 'a1' },
      { ...spec('a.spec.ts', 'm0', MIN, 1), testId: 'a2' },
      { ...spec('b.spec.ts', 'm0', MIN, 0), testId: 'b1' },
    ];
    const estimate = estimateMachineCounts(attempts)!;
    expect(estimate.workersPerMachine).toBe(2);
    expect(estimate.unit).toBe('spec');
    // Spec a: tests of 2 and 1 min on 2 workers; spec b: 1 min.
    expect(estimate.currentMs).toBe(2 * MIN);
    expect(estimate.longestUnitMs).toBe(2 * MIN);
    expect(estimate.more).toBeUndefined();
  });

  it('estimates nothing for fewer than two specs', () => {
    expect(estimateMachineCounts([])).toBeUndefined();
    expect(
      estimateMachineCounts([spec('a.spec.ts', 'm0', MIN)])
    ).toBeUndefined();
  });

  it('does not suggest more machines than there are specs', () => {
    const attempts = [
      spec('a.spec.ts', 'm0', MIN),
      spec('b.spec.ts', 'm1', MIN),
    ];
    const estimate = estimateMachineCounts(attempts)!;
    expect(estimate.mostMachinesTried).toBe(2);
    expect(estimate.more).toBeUndefined();
  });
});
