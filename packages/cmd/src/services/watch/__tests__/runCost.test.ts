import { describe, expect, it } from 'vitest';
import { estimateMachineCounts } from '../machineCount';
import {
  costSoFarLine,
  machineCountLines,
  runCostLine,
} from '../machineCostText';
import { runCost } from '../runCost';

const MIN = 60_000;

describe('runCost', () => {
  it('counts every machine for the whole window and its mean worker idle time', () => {
    const cost = runCost(
      [
        { machineId: 'a', idleMs: 0 },
        { machineId: 'a', idleMs: 4 * MIN },
        { machineId: 'b', idleMs: 10 * MIN },
      ],
      10 * MIN,
      0.5
    );
    expect(cost).toEqual({
      machines: 2,
      machineMinutes: 20,
      costUsd: 10,
      // Machine a: 2 min of 4 + 0 mean idle; machine b: 10 min.
      idleCostUsd: 6,
    });
    expect(runCostLine(cost)).toBe(
      'This run cost $10.00 on 2 machines, $6.00 of it idle.'
    );
    expect(costSoFarLine(cost)).toBe(
      'Cost so far: $10.00 on 2 machines, $6.00 of it idle'
    );
  });

  it('costs nothing without workers', () => {
    expect(runCost([], 0, 1).costUsd).toBe(0);
  });
});

describe('machineCountLines', () => {
  it('says when one long spec sets the wall time', () => {
    const estimate = estimateMachineCounts([
      {
        testId: 'l',
        file: 'long.spec.ts',
        machineId: 'm0',
        parallelIndex: 0,
        durationMs: 10 * MIN,
      },
      {
        testId: 's',
        file: 's.spec.ts',
        machineId: 'm1',
        parallelIndex: 0,
        durationMs: MIN / 2,
      },
      {
        testId: 't',
        file: 't.spec.ts',
        machineId: 'm1',
        parallelIndex: 0,
        durationMs: MIN / 2,
      },
    ])!;
    expect(machineCountLines(estimate, 11 * MIN)).toEqual([
      'Estimated wall time on other machine counts, from the test durations of this run (1 worker per machine):',
      '  2 machines, as in this run: about 10m00s (the run took 11m00s)',
      '  Same wall time (±10%) on 1 machine instead of 2',
      '  More machines would not make it faster: the longest spec file takes 10m00s',
      '  Assumes whole spec files move between machines, as with orchestration. Start-up time and time between tests are left out.',
    ]);
  });
});
