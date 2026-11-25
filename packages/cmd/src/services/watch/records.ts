import type {
  TerminalErrorDetail,
  TerminalRunEvent,
  TestEndStatus,
} from './events';

type RecordError = {
  message?: string | null;
  snippet?: string | null;
  location?: { file: string; line: number } | null;
};

/** An attempt of a test record as `GET /stream/runs/:runId` sends it. */
export type TestRecordAttempt = {
  attempt: number;
  parallelIndex: number;
  status: 'passed' | 'failed' | 'timedOut' | 'skipped' | 'interrupted';
  duration: number;
  done: boolean;
  error?: RecordError | null;
  lastStep?: {
    id: string;
    done: boolean;
    title: string;
    category: string;
    duration: number;
  } | null;
};

/**
 * A test record as `GET /stream/runs/:runId` sends it, with the fields `watch`
 * reads (`toStreamRecord` in the API's `runStream/records.ts`).
 */
export type TestRecord = {
  recordId: string;
  machineId: string;
  project: string | null;
  spec: string;
  title: string[];
  done: boolean;
  flaky: boolean;
  attempts: TestRecordAttempt[];
};

type Seen = {
  begun: Set<number>;
  ended: Set<number>;
  step?: string;
  flakyEnded?: boolean;
};

/**
 * Turns successive snapshots of test records into events. A record can be
 * fetched many times while it runs and arrives whole each time, so this keeps
 * what was already reported per record and emits only the difference.
 */
export class RecordEvents {
  private seen = new Map<string, Seen>();

  next(record: TestRecord): TerminalRunEvent[] {
    const testId = record.recordId;
    let seen = this.seen.get(testId);
    if (!seen) {
      seen = { begun: new Set(), ended: new Set() };
      this.seen.set(testId, seen);
    }
    const events: TerminalRunEvent[] = [];
    const attempts = [...record.attempts].sort((a, b) => a.attempt - b.attempt);
    const last = attempts[attempts.length - 1];

    for (const attempt of attempts) {
      const retry = attempt.attempt;
      if (!seen.begun.has(retry)) {
        seen.begun.add(retry);
        events.push({
          type: 'testBegin',
          testId,
          title: record.title,
          file: record.spec,
          project: record.project || undefined,
          worker: `${record.machineId}/${attempt.parallelIndex}`,
          retry,
        });
      }
      if (seen.ended.has(retry)) continue;

      events.push(...lastStepEvents(testId, attempt, seen));

      if (attempt.done) {
        seen.ended.add(retry);
        const flaky = record.done && record.flaky && attempt === last;
        seen.flakyEnded ||= flaky;
        events.push(testEnd(testId, attempt, flaky));
      }
    }

    // The record can be marked flaky after its last attempt was reported.
    if (record.done && record.flaky && last?.done && !seen.flakyEnded) {
      seen.flakyEnded = true;
      events.push(testEnd(testId, last, true));
    }
    return events;
  }
}

function lastStepEvents(
  testId: string,
  attempt: TestRecordAttempt,
  seen: Seen
): TerminalRunEvent[] {
  const events: TerminalRunEvent[] = [];
  // Records carry only the latest step, so a step in between two fetches
  // is never reported.
  const step = attempt.lastStep;
  const open = step && !step.done && !attempt.done ? step : undefined;
  if (seen.step && seen.step !== open?.id) {
    events.push({
      type: 'stepEnd',
      testId,
      stepId: seen.step,
      durationMs: step?.id === seen.step ? step.duration : 0,
    });
    seen.step = undefined;
  }
  if (open && seen.step !== open.id) {
    seen.step = open.id;
    events.push({
      type: 'stepBegin',
      testId,
      stepId: open.id,
      title: open.title,
      category: open.category,
    });
  }
  return events;
}

function errorDetail(
  error: RecordError | null | undefined
): TerminalErrorDetail | undefined {
  if (!error?.location && !error?.snippet) return undefined;
  return {
    location: error.location ?? undefined,
    snippet: error.snippet ?? undefined,
  };
}

function testEnd(
  testId: string,
  attempt: TestRecordAttempt,
  flaky: boolean
): TerminalRunEvent {
  return {
    type: 'testEnd',
    testId,
    status: flaky ? 'flaky' : toTestEndStatus(attempt.status),
    durationMs: attempt.duration,
    retry: attempt.attempt,
    error:
      attempt.error?.message ??
      (attempt.status === 'interrupted' ? 'Interrupted' : undefined),
    errorDetail: errorDetail(attempt.error),
  };
}

/**
 * The events have no interrupted status. An interrupted test did not finish,
 * so it is reported as failed, with "Interrupted" when it has no error.
 */
function toTestEndStatus(status: TestRecordAttempt['status']): TestEndStatus {
  return status === 'interrupted' ? 'failed' : status;
}
