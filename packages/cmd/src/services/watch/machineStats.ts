import type { RunEndStatus, TerminalRunEvent, TestEndStatus } from './events';
import {
  WorkerStatsTracker,
  type RunningTest,
  type WorkerStats,
} from './workerStats';

/** How long a machine shows as failed after a test failed on it. */
export const FAILED_RECENTLY_MS = 10_000;

/**
 * - running: a test runs on the machine
 * - idle: no test runs on it, and the run has not ended
 * - failedRecently: a test failed on it in the last `FAILED_RECENTLY_MS`
 * - done: the run ended
 *
 * Nothing in the events says that one machine has finished before the run
 * ends, so a machine that ran all its tests shows as idle until then.
 */
export type MachineState = 'running' | 'idle' | 'failedRecently' | 'done';

export type MachineStats = {
  machineId: string;
  state: MachineState;
  /** Tests whose last attempt ended on this machine, skipped tests included. */
  testsDone: number;
  /** Tests whose last attempt on this machine failed or timed out. */
  testsFailed: number;
  workers: number;
  /** The average duration of the attempts that ended on this machine, skipped tests left out. */
  averageTestMs?: number;
  /** `averageTestMs` divided by the median of it over all machines: 2 is twice as slow. */
  relativeTestTime?: number;
  /** The tests running now, the latest started first. */
  running: RunningTest[];
  /** When the machine started its first test and ended its last one, by the clock of the machine. */
  firstStartedAt?: number;
  lastEndedAt?: number;
  /** The spec file on which this machine spent the most test time. */
  longestSpec?: { file: string; durationMs: number };
  /** When the last step or test ended on this machine, by the clock of this process. */
  lastActivityAt?: number;
};

export type RunMachineStats = {
  /** Sorted by machine ID. */
  machines: MachineStats[];
  totalTests: number;
  testsDone: number;
  testsFailed: number;
  runStatus?: RunEndStatus;
};

type Machine = {
  machineId: string;
  /** The last result of each test that ended on this machine. */
  results: Map<string, TestEndStatus>;
  durationMs: number;
  attempts: number;
  specMs: Map<string, number>;
  firstStartedAt?: number;
  lastEndedAt?: number;
  lastActivityAt?: number;
  lastFailureAt?: number;
};

type TestBegin = Extract<TerminalRunEvent, { type: 'testBegin' }>;

/**
 * What each machine of a run did, from the events of the run. Busy time and
 * running tests come from `WorkerStatsTracker`, grouped by machine.
 *
 * Start and end times come from the records, so that the order in which the
 * machines finished holds for a run that is watched after it ended. The time
 * of the last activity and of the last failure is the time the event arrived:
 * it drives what the views show as happening now.
 */
export class MachineStatsTracker {
  readonly workers = new WorkerStatsTracker();
  private machines = new Map<string, Machine>();
  private attempts = new Map<string, TestBegin & { receivedAt: number }>();
  private testMachines = new Map<string, string>();
  private ended = new Set<string>();

  add(event: TerminalRunEvent, receivedAt = Date.now()) {
    this.workers.add(event, receivedAt);
    switch (event.type) {
      case 'testBegin': {
        const key = attemptKey(event.testId, event.retry);
        if (this.attempts.has(key)) break;
        this.attempts.set(key, { ...event, receivedAt });
        const machine = this.machine(machineOf(event.worker));
        this.testMachines.set(event.testId, machine.machineId);
        const startedAt = event.startedAt ?? receivedAt;
        machine.firstStartedAt = Math.min(
          machine.firstStartedAt ?? Infinity,
          startedAt
        );
        break;
      }
      case 'stepEnd': {
        const machineId = this.testMachines.get(event.testId);
        if (machineId) this.machine(machineId).lastActivityAt = receivedAt;
        break;
      }
      case 'testEnd': {
        const key = attemptKey(event.testId, event.retry);
        const begin = this.attempts.get(key);
        if (!begin) break;
        const machine = this.machine(machineOf(begin.worker));
        // A test that is retried on another machine counts on the machine of
        // its last attempt.
        this.machines.forEach((m) => {
          if (m !== machine) m.results.delete(event.testId);
        });
        machine.results.set(event.testId, event.status);
        if (event.status === 'failed' || event.status === 'timedOut') {
          machine.lastFailureAt = receivedAt;
        }
        // A record marked flaky after its last attempt ended sends a second
        // `testEnd` for that attempt: only its status changes.
        if (this.ended.has(key)) break;
        this.ended.add(key);
        machine.lastActivityAt = receivedAt;
        const endedAt =
          (begin.startedAt ?? receivedAt - event.durationMs) + event.durationMs;
        machine.lastEndedAt = Math.max(machine.lastEndedAt ?? 0, endedAt);
        if (event.status === 'skipped') break;
        machine.attempts += 1;
        machine.durationMs += event.durationMs;
        machine.specMs.set(
          begin.file,
          (machine.specMs.get(begin.file) ?? 0) + event.durationMs
        );
        break;
      }
    }
  }

  read(now = Date.now()): RunMachineStats {
    const workerStats = this.workers.read(now);
    const workersByMachine = new Map<string, WorkerStats[]>();
    workerStats.workers.forEach((w) => {
      const list = workersByMachine.get(w.machineId) ?? [];
      list.push(w);
      workersByMachine.set(w.machineId, list);
    });

    const machines = [...this.machines.values()]
      .sort((a, b) => a.machineId.localeCompare(b.machineId))
      .map((m): MachineStats => {
        const workers = workersByMachine.get(m.machineId) ?? [];
        const running = workers
          .flatMap((w) => (w.running ? [w.running] : []))
          .sort((a, b) => b.startedAt - a.startedAt);
        let testsFailed = 0;
        m.results.forEach((status) => {
          if (status === 'failed' || status === 'timedOut') testsFailed += 1;
        });
        const longest = maxEntry(m.specMs);
        return {
          machineId: m.machineId,
          state: machineState(m, running.length, workerStats.runStatus, now),
          testsDone: m.results.size,
          testsFailed,
          workers: workers.length,
          averageTestMs: m.attempts ? m.durationMs / m.attempts : undefined,
          running,
          firstStartedAt: m.firstStartedAt,
          lastEndedAt: m.lastEndedAt,
          longestSpec: longest
            ? { file: longest[0], durationMs: longest[1] }
            : undefined,
          lastActivityAt: m.lastActivityAt,
        };
      });

    const median = medianOf(
      machines.flatMap((m) =>
        m.averageTestMs !== undefined ? [m.averageTestMs] : []
      )
    );
    machines.forEach((m) => {
      if (m.averageTestMs !== undefined && median)
        m.relativeTestTime = m.averageTestMs / median;
    });

    return {
      machines,
      totalTests: workerStats.totalTests,
      testsDone: workerStats.testsDone,
      testsFailed: workerStats.testsFailed,
      runStatus: workerStats.runStatus,
    };
  }

  private machine(machineId: string) {
    let machine = this.machines.get(machineId);
    if (!machine) {
      machine = {
        machineId,
        results: new Map(),
        durationMs: 0,
        attempts: 0,
        specMs: new Map(),
      };
      this.machines.set(machineId, machine);
    }
    return machine;
  }
}

function machineState(
  m: Machine,
  running: number,
  runStatus: RunEndStatus | undefined,
  now: number
): MachineState {
  if (runStatus) return 'done';
  if (
    m.lastFailureAt !== undefined &&
    now - m.lastFailureAt < FAILED_RECENTLY_MS
  )
    return 'failedRecently';
  return running ? 'running' : 'idle';
}

/** `testBegin.worker` is `<machineId>/<parallelIndex>`. */
function machineOf(worker: string) {
  return worker.slice(0, worker.lastIndexOf('/'));
}

function attemptKey(testId: string, retry: number) {
  return `${testId}/${retry}`;
}

function maxEntry(map: Map<string, number>) {
  let best: [string, number] | undefined;
  map.forEach((value, key) => {
    if (!best || value > best[1]) best = [key, value];
  });
  return best;
}

function medianOf(values: number[]) {
  if (!values.length) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}
