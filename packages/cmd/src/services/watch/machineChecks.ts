import { isFailedAttempt, type EndedAttempt } from './endedAttempts';
import { errorGroupKey } from './failureSpread';

// A machine is compared with the other machines only on the spec files that
// ran on both. A spec file that is broken or slow in the code fails or slows
// every machine that runs it, so it then counts on both sides. A spec file
// that ran on one machine only is left out: a run split over machines by
// whole files gets no warning.
//
// The failure rule. A machine is flagged when, in the spec files it shares
// with other machines:
// - it ran at least MIN_TESTS tests and at least MIN_FAILED_TESTS of them
//   failed in at least one attempt;
// - the other machines ran at least MIN_OTHER_TESTS tests of those files;
// - its share of failed tests is at least FAILURE_RATIO times the share on
//   the other machines, and at least FAILURE_MARGIN above it.
// Tests are counted, not attempts, so that a broken test that fails each
// retry counts once.
const MIN_TESTS = 8;
const MIN_FAILED_TESTS = 3;
const MIN_OTHER_TESTS = 10;
const FAILURE_RATIO = 3;
const FAILURE_MARGIN = 0.25;

// The speed rule. Each passed attempt of the machine in a shared spec file is
// divided by the median duration of the passed attempts of that file on the
// other machines, when they have at least MIN_OTHER_PASSED of them. A
// machine is flagged when it has at least MIN_PASSED of these ratios and
// their median is at least SLOW_RATIO. Failed attempts are left out: they
// stop early or run into a timeout.
const MIN_OTHER_PASSED = 3;
const MIN_PASSED = 5;
const SLOW_RATIO = 1.5;

export type MachineWarning = {
  machineId: string;
  /** The other machines that ran tests of the spec files this machine ran. */
  otherMachines: number;
  /** Tests of this machine in spec files that also ran on other machines. */
  tests: number;
  failedTests: number;
  /** The share of failed tests in the same spec files on the other machines, from 0 to 1. */
  otherFailureRate: number;
  failuresStandOut: boolean;
  /** How many times longer its passed tests take than the same spec files on other machines (median). */
  slowRatio?: number;
  slow: boolean;
  /** Failed tests of the machine in any spec file, shared or not. */
  allFailedTests: number;
  /** Set when at least half of `allFailedTests`, and at least two, failed with the same error. */
  sharedError?: { message: string; tests: number };
  /** The number of different errors of `allFailedTests`. */
  errors: number;
};

type FileResults = {
  tests: Set<string>;
  failedTests: Set<string>;
  passedDurations: number[];
};

type Machine = {
  machineId: string;
  files: Map<string, FileResults>;
  /** Failed tests by the key of their error. */
  errors: Map<string, { message: string; tests: Set<string> }>;
  /** The rules that already flagged the machine. */
  warnedFor: Set<'failures' | 'slow'>;
};

/**
 * Compares the machines of a run on failures and on speed, and warns about a
 * machine that stands out from the others: once when the first rule flags it,
 * and once more if the other rule flags it later. See the rules above.
 */
export class MachineChecks {
  private machines = new Map<string, Machine>();

  add(attempt: EndedAttempt): MachineWarning[] {
    const machine = this.machine(attempt.machineId);
    let file = machine.files.get(attempt.file);
    if (!file) {
      file = { tests: new Set(), failedTests: new Set(), passedDurations: [] };
      machine.files.set(attempt.file, file);
    }
    file.tests.add(attempt.testId);
    if (isFailedAttempt(attempt)) {
      file.failedTests.add(attempt.testId);
      const key = errorGroupKey(
        attempt.error ?? '',
        attempt.errorDetail?.location
      );
      const error = machine.errors.get(key) ?? {
        message: (attempt.error ?? '')
          .trim()
          .split('\n')[0]
          .replace(/^Error: /, ''),
        tests: new Set<string>(),
      };
      error.tests.add(attempt.testId);
      machine.errors.set(key, error);
    } else {
      file.passedDurations.push(attempt.durationMs);
    }
    // A machine can stand out only once the others have run enough tests,
    // so every machine is checked again, not only the one of this attempt.
    const warnings: MachineWarning[] = [];
    for (const candidate of this.machines.values()) {
      const warning = this.check(candidate);
      if (!warning) continue;
      const newRules = (['failures', 'slow'] as const).filter(
        (rule) =>
          (rule === 'failures' ? warning.failuresStandOut : warning.slow) &&
          !candidate.warnedFor.has(rule)
      );
      if (!newRules.length) continue;
      newRules.forEach((rule) => candidate.warnedFor.add(rule));
      warnings.push(warning);
    }
    return warnings;
  }

  private machine(machineId: string) {
    let machine = this.machines.get(machineId);
    if (!machine) {
      machine = {
        machineId,
        files: new Map(),
        errors: new Map(),
        warnedFor: new Set(),
      };
      this.machines.set(machineId, machine);
    }
    return machine;
  }

  private check(machine: Machine): MachineWarning | undefined {
    const tests = new Set<string>();
    const failedTests = new Set<string>();
    const otherMachines = new Set<string>();
    let otherTests = 0;
    let otherFailedTests = 0;
    const ratios: number[] = [];

    machine.files.forEach((own, file) => {
      const others = [...this.machines.values()].flatMap((m) => {
        const results = m === machine ? undefined : m.files.get(file);
        return results ? [{ machineId: m.machineId, results }] : [];
      });
      if (!others.length) return;
      others.forEach((o) => otherMachines.add(o.machineId));
      own.tests.forEach((t) => tests.add(t));
      own.failedTests.forEach((t) => failedTests.add(t));
      otherTests += sum(others.map((o) => o.results.tests.size));
      otherFailedTests += sum(others.map((o) => o.results.failedTests.size));
      const otherPassed = others.flatMap((o) => o.results.passedDurations);
      if (otherPassed.length < MIN_OTHER_PASSED) return;
      const otherMedian = median(otherPassed);
      if (otherMedian > 0) {
        own.passedDurations.forEach((d) => ratios.push(d / otherMedian));
      }
    });

    const otherFailureRate = otherTests ? otherFailedTests / otherTests : 0;
    const failureRate = tests.size ? failedTests.size / tests.size : 0;
    const failuresStandOut =
      tests.size >= MIN_TESTS &&
      failedTests.size >= MIN_FAILED_TESTS &&
      otherTests >= MIN_OTHER_TESTS &&
      failureRate >= otherFailureRate * FAILURE_RATIO &&
      failureRate >= otherFailureRate + FAILURE_MARGIN;
    const slowRatio = ratios.length >= MIN_PASSED ? median(ratios) : undefined;
    const slow = slowRatio !== undefined && slowRatio >= SLOW_RATIO;
    if (!failuresStandOut && !slow) return;

    const errors = [...machine.errors.values()];
    const top = errors.sort((a, b) => b.tests.size - a.tests.size)[0];
    const allFailedTests = new Set(errors.flatMap((e) => [...e.tests])).size;
    const shared =
      top && top.tests.size >= 2 && top.tests.size * 2 >= allFailedTests;
    return {
      machineId: machine.machineId,
      otherMachines: otherMachines.size,
      tests: tests.size,
      failedTests: failedTests.size,
      allFailedTests,
      otherFailureRate,
      failuresStandOut,
      slowRatio,
      slow,
      sharedError: shared
        ? { message: top.message, tests: top.tests.size }
        : undefined,
      errors: errors.length,
    };
  }
}

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}
