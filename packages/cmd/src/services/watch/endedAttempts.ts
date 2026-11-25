import type {
  TerminalErrorDetail,
  TerminalRunEvent,
  TestEndStatus,
} from './events';

export type EndedAttempt = {
  testId: string;
  retry: number;
  machineId: string;
  /** The spec file of the test, as in `testBegin`. */
  file: string;
  /** `flaky` is the passed last attempt of a test that failed before. */
  status: Exclude<TestEndStatus, 'skipped'>;
  durationMs: number;
  /** In ms since the epoch, when the record has the start time of the attempt. */
  endedAt?: number;
  error?: string;
  errorDetail?: TerminalErrorDetail;
};

type BegunAttempt = {
  machineId: string;
  parallelIndex: number;
  file: string;
  startedAt?: number;
  ended: boolean;
};

/**
 * Pairs each `testEnd` with the `testBegin` of the same attempt and reports
 * every attempt once, when it ends. Skipped tests are left out: they ran no
 * code on the machine.
 */
export class EndedAttempts {
  private attempts = new Map<string, BegunAttempt>();

  add(event: TerminalRunEvent): EndedAttempt | undefined {
    if (event.type === 'testBegin') {
      const key = attemptKey(event.testId, event.retry);
      if (this.attempts.has(key)) return;
      const slash = event.worker.lastIndexOf('/');
      this.attempts.set(key, {
        machineId: event.worker.slice(0, slash),
        parallelIndex: Number(event.worker.slice(slash + 1)),
        file: event.file,
        startedAt: event.startedAt,
        ended: false,
      });
      return;
    }
    if (event.type !== 'testEnd' || event.status === 'skipped') return;
    const attempt = this.attempts.get(attemptKey(event.testId, event.retry));
    // A record marked flaky after its last attempt was reported sends a
    // second `testEnd` for that attempt.
    if (!attempt || attempt.ended) return;
    attempt.ended = true;
    // Playwright gives parallel index -1 to tests it did not start.
    if (attempt.parallelIndex < 0) return;
    return {
      testId: event.testId,
      retry: event.retry,
      machineId: attempt.machineId,
      file: attempt.file,
      status: event.status,
      durationMs: event.durationMs,
      endedAt:
        attempt.startedAt === undefined
          ? undefined
          : attempt.startedAt + event.durationMs,
      error: event.error,
      errorDetail: event.errorDetail,
    };
  }
}

export function isFailedAttempt(attempt: EndedAttempt) {
  return attempt.status === 'failed' || attempt.status === 'timedOut';
}

function attemptKey(testId: string, retry: number) {
  return `${testId}/${retry}`;
}
