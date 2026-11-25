import { maxBy, minBy, orderBy } from 'lodash';
import type { AttemptStep } from '../watch/records';

/** The fields of a GraphQL `TestRecord` that the card reads. */
export const WRAPPED_RECORD_FIELDS = `recordId machineId title _s _f
  attempts { attempt parallelIndex startTime status duration }`;

export type WrappedAttempt = {
  attempt: number;
  /** -1 for a test that did not run on a worker, such as a skipped test. */
  parallelIndex: number;
  startTime: string;
  status: 'passed' | 'failed' | 'timedOut' | 'skipped' | 'interrupted';
  duration: number;
};

export type WrappedRecord = {
  recordId: string;
  machineId: string;
  title: string[];
  _s: 'passed' | 'failed' | 'pending' | 'skipped';
  _f: boolean;
  attempts: WrappedAttempt[];
};

export type RunFacts = {
  tests: {
    total: number;
    passed: number;
    failed: number;
    flaky: number;
    skipped: number;
  };
  /** Shown when more than one worker ran tests and the run took less time than its tests. */
  parallel?: {
    workers: number;
    testTimeMs: number;
    wallMs: number;
    savedMs: number;
  };
  busiestWorker?: {
    name: string;
    tests: number;
    timeMs: number;
    /** Of the time of all tests, from 0 to 1. */
    share: number;
  };
  longestTest?: { title: string; durationMs: number };
  /** The flaky test with the most failed attempts, then the most time in them. */
  flakiestTest?: { title: string; failedAttempts: number; failedMs: number };
  firstFailure?: { title: string; afterMs: number };
  /** Undefined when the steps were not read. */
  steps?: {
    total: number;
    /**
     * Leaves out setup steps (hooks and fixtures) and the steps inside them.
     * `runs` counts the steps with the same title.
     */
    slowest?: { title: string; durationMs: number; runs: number };
  };
};

export type RunFactsInput = {
  records: WrappedRecord[];
  /** When the run was created, in ms since the epoch. */
  createdAt: number;
  /** How long the run took, from the run. Computed from the attempts when missing. */
  wallMs?: number;
  /** The steps of every attempt that ran, or undefined when they were not read. */
  attemptSteps?: AttemptStep[][];
};

/** Step categories Playwright uses for setup, as in `watch/print.ts`. */
const SETUP_CATEGORIES = new Set(['hook', 'fixture']);
const FAILED_STATUSES = new Set(['failed', 'timedOut', 'interrupted']);

export function computeRunFacts(input: RunFactsInput): RunFacts {
  const { records } = input;
  const attempts = records.flatMap((record) =>
    record.attempts.map((attempt) => ({ record, attempt }))
  );
  const ran = attempts.filter(({ attempt }) => attempt.parallelIndex >= 0);
  const start = Math.min(
    input.createdAt,
    ...attempts.map(({ attempt }) => Date.parse(attempt.startTime))
  );
  const end = Math.max(
    start,
    ...attempts.map(
      ({ attempt }) => Date.parse(attempt.startTime) + attempt.duration
    )
  );

  return {
    tests: countTests(records),
    ...parallelFacts(ran, input.wallMs ?? end - start),
    longestTest: longestTest(ran),
    flakiestTest: flakiestTest(records),
    firstFailure: firstFailure(attempts, start),
    steps: input.attemptSteps && stepFacts(input.attemptSteps),
  };
}

function countTests(records: WrappedRecord[]) {
  const tests = {
    total: records.length,
    passed: 0,
    failed: 0,
    flaky: 0,
    skipped: 0,
  };
  for (const record of records) {
    if (record._f) tests.flaky += 1;
    else if (record._s === 'passed') tests.passed += 1;
    else if (record._s === 'failed') tests.failed += 1;
    else tests.skipped += 1;
  }
  return tests;
}

type RecordAttempt = { record: WrappedRecord; attempt: WrappedAttempt };

function parallelFacts(
  ran: RecordAttempt[],
  wallMs: number
): Pick<RunFacts, 'parallel' | 'busiestWorker'> {
  const machines = new Set(ran.map(({ record }) => record.machineId));
  const workers = new Map<
    string,
    { name: string; tests: Set<string>; timeMs: number }
  >();
  let testTimeMs = 0;
  for (const { record, attempt } of ran) {
    testTimeMs += attempt.duration;
    const key = `${record.machineId}/${attempt.parallelIndex}`;
    const worker = workers.get(key) ?? {
      name:
        machines.size > 1
          ? `Worker ${attempt.parallelIndex} on machine ${record.machineId}`
          : `Worker ${attempt.parallelIndex}`,
      tests: new Set<string>(),
      timeMs: 0,
    };
    worker.tests.add(record.recordId);
    worker.timeMs += attempt.duration;
    workers.set(key, worker);
  }
  if (workers.size < 2 || testTimeMs <= wallMs) return {};
  const busiest = maxBy([...workers.values()], (w) => w.timeMs)!;
  return {
    parallel: {
      workers: workers.size,
      testTimeMs,
      wallMs,
      savedMs: testTimeMs - wallMs,
    },
    busiestWorker: {
      name: busiest.name,
      tests: busiest.tests.size,
      timeMs: busiest.timeMs,
      share: busiest.timeMs / testTimeMs,
    },
  };
}

function flakiestTest(records: WrappedRecord[]): RunFacts['flakiestTest'] {
  const flaky = records
    .filter((record) => record._f)
    .map((record) => {
      const failed = record.attempts.filter((a) =>
        FAILED_STATUSES.has(a.status)
      );
      return {
        title: shortTitle(record),
        failedAttempts: failed.length,
        failedMs: failed.reduce((sum, a) => sum + a.duration, 0),
      };
    })
    .filter((test) => test.failedAttempts > 0);
  return orderBy(flaky, ['failedAttempts', 'failedMs'], ['desc', 'desc'])[0];
}

function longestTest(ran: RecordAttempt[]): RunFacts['longestTest'] {
  const longest = maxBy(ran, ({ attempt }) => attempt.duration);
  return (
    longest && {
      title: shortTitle(longest.record),
      durationMs: longest.attempt.duration,
    }
  );
}

function firstFailure(
  attempts: RecordAttempt[],
  start: number
): RunFacts['firstFailure'] {
  const endOf = (attempt: WrappedAttempt) =>
    Date.parse(attempt.startTime) + attempt.duration;
  const first = minBy(
    attempts.filter(({ attempt }) => FAILED_STATUSES.has(attempt.status)),
    ({ attempt }) => endOf(attempt)
  );
  return (
    first && {
      title: shortTitle(first.record),
      afterMs: endOf(first.attempt) - start,
    }
  );
}

function stepFacts(attemptSteps: AttemptStep[][]): RunFacts['steps'] {
  let total = 0;
  const runs = new Map<string, number>();
  let slowest: AttemptStep | undefined;

  const walk = (steps: AttemptStep[], setup: boolean) => {
    for (const step of steps) {
      total += 1;
      const inSetup = setup || SETUP_CATEGORIES.has(step.category ?? '');
      if (!inSetup) {
        runs.set(step.title, (runs.get(step.title) ?? 0) + 1);
        if (!slowest || step.duration > slowest.duration) slowest = step;
      }
      walk(step.steps, inSetup);
    }
  };
  attemptSteps.forEach((steps) => walk(steps, false));
  if (!total) return undefined;
  return {
    total,
    slowest: slowest && {
      title: slowest.title,
      durationMs: slowest.duration,
      runs: runs.get(slowest.title) ?? 1,
    },
  };
}

function shortTitle(record: WrappedRecord) {
  return record.title[record.title.length - 1] ?? record.recordId;
}
