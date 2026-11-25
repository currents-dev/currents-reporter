import type { RunEndStatus, TerminalRunEvent, TestEndStatus } from './events';

export type RunningTest = {
  testId: string;
  title: string[];
  file: string;
  project?: string;
  retry: number;
  startedAt: number;
};

export type WorkerStats = {
  /** `<machineId>/<parallelIndex>`, as in `testBegin`. */
  worker: string;
  machineId: string;
  parallelIndex: number;
  /** Attempts that ended on this worker, retries included and skipped tests left out. */
  tests: number;
  busyMs: number;
  /** The time of `windowMs` the worker ran no test. */
  idleMs: number;
  running?: RunningTest;
};

export type RunWorkerStats = {
  /** Sorted by machine, then by parallel index. */
  workers: WorkerStats[];
  /** From the start of the first attempt to the end of the last one, or to now while tests run. */
  windowMs: number;
  totalTests: number;
  /** Tests whose last attempt ended and that run no other attempt. */
  testsDone: number;
  /** Tests whose last result is failed or timed out. */
  testsFailed: number;
  runStatus?: RunEndStatus;
};

/** An attempt that ran on a worker and ended. */
export type EndedAttempt = {
  testId: string;
  file: string;
  project?: string;
  machineId: string;
  parallelIndex: number;
  durationMs: number;
};

type Attempt = {
  testId: string;
  title: string[];
  file: string;
  project?: string;
  retry: number;
  worker: string;
  startedAt: number;
  /** Set when the start time is the time the event arrived, not the time from the record. */
  startedAtIsReceiveTime: boolean;
  end?: { at: number; durationMs: number; status: TestEndStatus };
};

/**
 * Busy and idle time of each worker of a run, from the events of the run.
 * Times come from the `startedAt` and `durationMs` of the events. When an
 * attempt has no `startedAt`, the time its events arrived is used instead,
 * which is late by the delay of the event stream.
 */
export class WorkerStatsTracker {
  private attempts = new Map<string, Attempt>();
  private lastResults = new Map<string, TestEndStatus>();
  private totalTests = 0;
  private runEnd?: { status: RunEndStatus; at: number };

  add(event: TerminalRunEvent, receivedAt = Date.now()) {
    switch (event.type) {
      case 'runBegin':
        this.totalTests = event.totalTests;
        break;
      case 'testBegin': {
        const key = attemptKey(event.testId, event.retry);
        if (this.attempts.has(key)) break;
        this.attempts.set(key, {
          testId: event.testId,
          title: event.title,
          file: event.file,
          project: event.project,
          retry: event.retry,
          worker: event.worker,
          startedAt: event.startedAt ?? receivedAt,
          startedAtIsReceiveTime: event.startedAt === undefined,
        });
        break;
      }
      case 'testEnd': {
        this.lastResults.set(event.testId, event.status);
        const attempt = this.attempts.get(
          attemptKey(event.testId, event.retry)
        );
        if (!attempt) break;
        // A record marked flaky after its last attempt ended sends a second
        // `testEnd` for that attempt: only its status changes.
        if (attempt.startedAtIsReceiveTime && !attempt.end) {
          attempt.startedAt = Math.min(
            attempt.startedAt,
            receivedAt - event.durationMs
          );
        }
        attempt.end = {
          at: attempt.startedAt + event.durationMs,
          durationMs: event.durationMs,
          status: event.status,
        };
        break;
      }
      case 'runEnd':
        this.runEnd = { status: event.status, at: receivedAt };
        break;
    }
  }

  /** Skipped attempts and attempts that ran on no worker are left out. */
  endedAttempts(): EndedAttempt[] {
    return [...this.attempts.values()].flatMap((attempt) => {
      const { machineId, parallelIndex } = parseWorker(attempt.worker);
      if (!attempt.end || attempt.end.status === 'skipped' || parallelIndex < 0)
        return [];
      return [
        {
          testId: attempt.testId,
          file: attempt.file,
          project: attempt.project,
          machineId,
          parallelIndex,
          durationMs: attempt.end.durationMs,
        },
      ];
    });
  }

  read(now = Date.now()): RunWorkerStats {
    // Tests that still run when the run ended were stopped with it.
    const until = this.runEnd?.at ?? now;
    const workers = new Map<string, WorkerStats>();
    const busyIntervals = new Map<string, [number, number][]>();
    let windowStart = Infinity;
    let windowEnd = -Infinity;

    for (const attempt of this.attempts.values()) {
      const { machineId, parallelIndex } = parseWorker(attempt.worker);
      // Playwright gives parallel index -1 to tests it skipped without
      // starting a worker.
      if (parallelIndex < 0 || attempt.end?.status === 'skipped') continue;
      let stats = workers.get(attempt.worker);
      if (!stats) {
        stats = {
          worker: attempt.worker,
          machineId,
          parallelIndex,
          tests: 0,
          busyMs: 0,
          idleMs: 0,
        };
        workers.set(attempt.worker, stats);
        busyIntervals.set(attempt.worker, []);
      }
      // The clock of the machine that runs the tests can be ahead of this one.
      const endedAt = attempt.end?.at ?? Math.max(attempt.startedAt, until);
      busyIntervals.get(attempt.worker)!.push([attempt.startedAt, endedAt]);
      windowStart = Math.min(windowStart, attempt.startedAt);
      windowEnd = Math.max(windowEnd, endedAt);
      if (attempt.end) {
        stats.tests += 1;
      } else {
        if (!this.runEnd && (stats.running?.startedAt ?? 0) < attempt.startedAt)
          stats.running = runningTest(attempt);
      }
    }

    const windowMs = Math.max(0, windowEnd - windowStart);
    workers.forEach((stats) => {
      stats.busyMs = mergedLength(busyIntervals.get(stats.worker)!);
      stats.idleMs = Math.max(0, windowMs - stats.busyMs);
    });

    const runningTests = new Set(
      [...this.attempts.values()]
        .filter((a) => !a.end && !this.runEnd)
        .map((a) => a.testId)
    );
    let testsDone = 0;
    let testsFailed = 0;
    this.lastResults.forEach((status, testId) => {
      if (!runningTests.has(testId)) testsDone += 1;
      if (status === 'failed' || status === 'timedOut') testsFailed += 1;
    });

    return {
      workers: [...workers.values()].sort(
        (a, b) =>
          a.machineId.localeCompare(b.machineId) ||
          a.parallelIndex - b.parallelIndex
      ),
      windowMs,
      totalTests: this.totalTests,
      testsDone,
      testsFailed,
      runStatus: this.runEnd?.status,
    };
  }
}

/**
 * The time covered by the intervals. They can overlap: the begin of the next
 * test on a worker can arrive before the end of the test before it, and both
 * then count as running.
 */
function mergedLength(intervals: [number, number][]) {
  let total = 0;
  let coveredUntil = -Infinity;
  for (const [start, end] of [...intervals].sort((a, b) => a[0] - b[0])) {
    total += Math.max(0, end - Math.max(start, coveredUntil));
    coveredUntil = Math.max(coveredUntil, end);
  }
  return total;
}

function attemptKey(testId: string, retry: number) {
  return `${testId}/${retry}`;
}

function parseWorker(worker: string) {
  const slash = worker.lastIndexOf('/');
  return {
    machineId: worker.slice(0, slash),
    parallelIndex: Number(worker.slice(slash + 1)),
  };
}

function runningTest(attempt: Attempt): RunningTest {
  return {
    testId: attempt.testId,
    title: attempt.title,
    file: attempt.file,
    project: attempt.project,
    retry: attempt.retry,
    startedAt: attempt.startedAt,
  };
}
