import type {
  TerminalErrorDetail,
  TerminalRunEvent,
  TestEndStatus,
} from './events';

const ERROR_FIELDS = 'message snippet location { file line }';

/** The fields of a GraphQL `TestRecord` that `watch` reads. */
export const TEST_RECORD_FIELDS = `recordId machineId groupId spec title _d _f
  attempts { attempt parallelIndex status duration _d error { ${ERROR_FIELDS} }
    lastStep { id _d title category duration } }`;

/**
 * The fields of a GraphQL `SerializedTestStep` that `watch` reads. Nested
 * steps come as a JSON string of the stored steps, which have every field.
 */
export const ATTEMPT_STEP_FIELDS = `id title category duration steps
  error { ${ERROR_FIELDS} } location { file line }`;

type RecordError = {
  message?: string | null;
  snippet?: string | null;
  location?: { file: string; line: number } | null;
};

/** A step of an attempt. `duration` is -1 while the step runs. */
export type AttemptStep = {
  id: string;
  title: string;
  category?: string | null;
  duration: number;
  error?: RecordError | null;
  location?: { file: string; line: number } | null;
  steps: AttemptStep[];
};

export type TestRecordAttempt = {
  attempt: number;
  parallelIndex: number;
  status: 'passed' | 'failed' | 'timedOut' | 'skipped' | 'interrupted';
  duration: number;
  _d: boolean;
  error?: RecordError | null;
  lastStep?: {
    id: string;
    _d: boolean;
    title: string;
    category: string;
    duration: number;
  } | null;
};

export type TestRecord = {
  recordId: string;
  machineId: string;
  groupId: string;
  spec: string;
  title: string[];
  _d: boolean;
  _f: boolean;
  attempts: TestRecordAttempt[];
};

type Seen = {
  begun: Set<number>;
  ended: Set<number>;
  step?: string;
  flakyEnded?: boolean;
  stepsBegun: Set<string>;
  stepsEnded: Set<string>;
};

/**
 * Turns successive snapshots of test records into events. A record can be
 * fetched many times while it runs and arrives whole each time, so this keeps
 * what was already reported per record and emits only the difference.
 */
export class RecordEvents {
  private seen = new Map<string, Seen>();

  /**
   * The attempts of a record whose steps are worth reading: the ones not
   * reported as ended yet that are still running, were seen running, or
   * failed. A passed attempt first seen finished is reported without steps,
   * so that watching a finished run does not read every attempt.
   */
  attemptsNeedingSteps(record: TestRecord): number[] {
    const seen = this.seen.get(record.recordId);
    return record.attempts
      .filter(
        (a) =>
          !seen?.ended.has(a.attempt) &&
          (!a._d || seen?.begun.has(a.attempt) || a.status !== 'passed')
      )
      .map((a) => a.attempt);
  }

  /**
   * `steps` holds the steps of the attempts that were read. An attempt without
   * them is followed through `lastStep`, which only has the latest step.
   */
  next(
    record: TestRecord,
    steps: Map<number, AttemptStep[]> = new Map()
  ): TerminalRunEvent[] {
    const testId = record.recordId;
    let seen = this.seen.get(testId);
    if (!seen) {
      seen = {
        begun: new Set(),
        ended: new Set(),
        stepsBegun: new Set(),
        stepsEnded: new Set(),
      };
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
          project: record.groupId || undefined,
          worker: `${record.machineId}/${attempt.parallelIndex}`,
          retry,
        });
      }
      if (seen.ended.has(retry)) continue;

      const attemptSteps = steps.get(retry);
      if (attemptSteps) {
        events.push(...stepEvents(testId, attemptSteps, seen));
      } else {
        events.push(...lastStepEvents(testId, attempt, seen));
      }

      if (attempt._d) {
        seen.ended.add(retry);
        const flaky = record._d && record._f && attempt === last;
        seen.flakyEnded ||= flaky;
        events.push(testEnd(record, attempt, flaky));
      }
    }

    // The record can be marked flaky after its last attempt was reported.
    if (record._d && record._f && last?._d && !seen.flakyEnded) {
      seen.flakyEnded = true;
      events.push(testEnd(record, last, true));
    }
    return events;
  }
}

/**
 * Events for the steps not reported yet, parents before their nested steps.
 * A step can begin and end between two reads; both events are then reported
 * together.
 */
function stepEvents(
  testId: string,
  steps: AttemptStep[],
  seen: Seen,
  parentStepId?: string
): TerminalRunEvent[] {
  const events: TerminalRunEvent[] = [];
  for (const step of steps) {
    if (!seen.stepsBegun.has(step.id)) {
      seen.stepsBegun.add(step.id);
      events.push({
        type: 'stepBegin',
        testId,
        stepId: step.id,
        title: step.title,
        category: step.category ?? undefined,
        location: step.location ?? undefined,
        parentStepId,
      });
    }
    events.push(...stepEvents(testId, step.steps, seen, step.id));
    if (step.duration >= 0 && !seen.stepsEnded.has(step.id)) {
      seen.stepsEnded.add(step.id);
      events.push({
        type: 'stepEnd',
        testId,
        stepId: step.id,
        durationMs: step.duration,
        error: step.error?.message ?? undefined,
        errorDetail: errorDetail(step.error),
      });
    }
  }
  return events;
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
  const open = step && !step._d && !attempt._d ? step : undefined;
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
  record: TestRecord,
  attempt: TestRecordAttempt,
  flaky: boolean
): TerminalRunEvent {
  return {
    type: 'testEnd',
    testId: record.recordId,
    title: record.title,
    file: record.spec,
    project: record.groupId || undefined,
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
