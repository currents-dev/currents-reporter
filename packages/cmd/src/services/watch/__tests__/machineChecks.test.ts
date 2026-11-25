import { describe, expect, it } from 'vitest';
import type { EndedAttempt } from '../endedAttempts';
import { MachineChecks, type MachineWarning } from '../machineChecks';

let nextTest = 0;
const attempt = (
  machineId: string,
  file: string,
  over: Partial<EndedAttempt> = {}
): EndedAttempt => ({
  testId: `t${nextTest++}`,
  retry: 0,
  machineId,
  file,
  status: 'passed',
  durationMs: 20_000,
  ...over,
});

const failed = (
  machineId: string,
  file: string,
  error: string,
  over: Partial<EndedAttempt> = {}
) => attempt(machineId, file, { status: 'failed', error, ...over });

const lost = 'Error: ECONNRESET: lost connection to db 10.0.0.7';
const healthy = ['m1', 'm2', 'm3', 'm4', 'm5'];
const files = ['a.spec.ts', 'b.spec.ts'];

/** Each healthy machine runs `perFile` passed tests of each shared spec file. */
function healthyRun(checks: MachineChecks, perFile = 3) {
  const warnings: MachineWarning[] = [];
  for (let i = 0; i < perFile; i++) {
    for (const machine of healthy) {
      for (const file of files) {
        warnings.push(...checks.add(attempt(machine, file)));
      }
    }
  }
  return warnings;
}

describe('MachineChecks', () => {
  it('does not warn about one failure on a machine that ran 2 tests', () => {
    const checks = new MachineChecks();
    expect(healthyRun(checks)).toEqual([]);
    expect(checks.add(attempt('m6', 'a.spec.ts'))).toEqual([]);
    expect(checks.add(failed('m6', 'a.spec.ts', 'Error: boom'))).toEqual([]);
  });

  it('does not warn about a broken spec file that ran on one machine only', () => {
    const checks = new MachineChecks();
    healthyRun(checks);
    const warnings = [];
    for (let i = 0; i < 6; i++) {
      warnings.push(...checks.add(attempt('m6', files[i % 2])));
    }
    for (let i = 0; i < 4; i++) {
      warnings.push(
        ...checks.add(failed('m6', 'broken.spec.ts', 'Error: total is wrong'))
      );
    }
    expect(warnings).toEqual([]);
  });

  it('does not warn about a slow spec file that ran on one machine only', () => {
    const checks = new MachineChecks();
    healthyRun(checks);
    const warnings = [];
    for (let i = 0; i < 8; i++) {
      warnings.push(
        ...checks.add(attempt('m6', 'slow.spec.ts', { durationMs: 40_000 }))
      );
    }
    warnings.push(...checks.add(attempt('m6', 'a.spec.ts')));
    expect(warnings).toEqual([]);
  });

  it('does not warn about a broken spec file that fails on every machine', () => {
    const checks = new MachineChecks();
    const warnings = [];
    for (let i = 0; i < 10; i++) {
      for (const machine of [...healthy, 'm6']) {
        warnings.push(
          ...checks.add(
            i < 4
              ? failed(machine, 'a.spec.ts', `Error: broken ${i}`)
              : attempt(machine, files[i % 2])
          )
        );
      }
    }
    expect(warnings).toEqual([]);
  });

  it('does not count a broken test that fails each retry more than once', () => {
    const checks = new MachineChecks();
    healthyRun(checks);
    const warnings = [];
    for (let i = 0; i < 8; i++) {
      warnings.push(...checks.add(attempt('m6', files[i % 2])));
    }
    for (const [testId, retry] of [
      ['cart-a', 0],
      ['cart-a', 1],
      ['cart-b', 0],
      ['cart-b', 1],
    ] as const) {
      warnings.push(
        ...checks.add(
          failed('m6', 'a.spec.ts', 'Error: cart total is wrong', {
            testId,
            retry,
          })
        )
      );
    }
    expect(warnings).toEqual([]);
  });

  it('does not warn about speed when the machines differ by less than 1.5x', () => {
    const checks = new MachineChecks();
    const warnings = [];
    for (let i = 0; i < 10; i++) {
      for (const [machine, durationMs] of [
        ['m1', 20_000],
        ['m2', 25_000],
        ['m3', 28_000],
      ] as const) {
        warnings.push(
          ...checks.add(attempt(machine, files[i % 2], { durationMs }))
        );
      }
    }
    expect(warnings).toEqual([]);
  });

  it('warns about a machine whose tests fail much more often, with their shared error', () => {
    const checks = new MachineChecks();
    healthyRun(checks);
    checks.add(failed('m1', 'a.spec.ts', 'Error: cart total is wrong'));
    const warnings = [];
    for (let i = 0; i < 10; i++) {
      warnings.push(
        ...checks.add(
          i % 2 ? failed('bad', files[i % 2], lost) : attempt('bad', files[0])
        )
      );
    }
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatchObject({
      machineId: 'bad',
      otherMachines: 5,
      tests: 8,
      failedTests: 4,
      allFailedTests: 4,
      failuresStandOut: true,
      slow: false,
      sharedError: {
        message: 'ECONNRESET: lost connection to db 10.0.0.7',
        tests: 4,
      },
    });
    expect(warnings[0].otherFailureRate).toBeCloseTo(1 / 31);
  });

  it('says when the failures of a flagged machine have different errors', () => {
    const checks = new MachineChecks();
    healthyRun(checks);
    const warnings = [];
    for (let i = 0; i < 8; i++) {
      warnings.push(
        ...checks.add(
          i < 4
            ? failed('bad', files[i % 2], `Error: broken ${'abcd'[i]}`)
            : attempt('bad', files[i % 2])
        )
      );
    }
    expect(warnings[0]).toMatchObject({ allFailedTests: 4, errors: 4 });
    expect(warnings[0].sharedError).toBeUndefined();
  });

  it('warns about a machine that takes twice as long for the same spec files', () => {
    const checks = new MachineChecks();
    healthyRun(checks);
    const warnings = [];
    for (let i = 0; i < 6; i++) {
      warnings.push(
        ...checks.add(attempt('slow', files[i % 2], { durationMs: 40_000 }))
      );
    }
    // Failed attempts stop early and are not timed.
    warnings.push(
      ...checks.add(
        failed('m1', files[0], 'Error: timeout', { durationMs: 200_000 })
      )
    );
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatchObject({
      machineId: 'slow',
      slow: true,
      slowRatio: 2,
    });
  });

  it('warns again when a slow machine later also fails much more often', () => {
    const checks = new MachineChecks();
    healthyRun(checks);
    const warnings = [];
    for (let i = 0; i < 9; i++) {
      warnings.push(
        ...checks.add(
          i < 5
            ? attempt('slow', files[i % 2], { durationMs: 48_000 })
            : failed('slow', files[i % 2], lost)
        )
      );
    }
    expect(warnings.map((w) => [w.slow, w.failuresStandOut])).toEqual([
      [true, false],
      [true, true],
    ]);
    expect(warnings[1].sharedError?.tests).toBe(3);
  });
});
