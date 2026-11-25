/**
 * The event stream of a run that `currents watch` produces and a terminal
 * view consumes. The Playwright reporter will produce the same events locally,
 * so the shape is shared: change it only together with that reporter.
 */
export type TerminalRunEvent =
  | { type: 'runBegin'; totalTests: number; startedAt: number; runUrl?: string }
  | {
      type: 'testBegin';
      testId: string;
      title: string[];
      file: string;
      project?: string;
      worker: string;
      retry: number;
    }
  | {
      type: 'stepBegin';
      testId: string;
      stepId: string;
      title: string;
      category?: string;
      location?: { file: string; line: number };
    }
  | {
      type: 'stepEnd';
      testId: string;
      stepId: string;
      durationMs: number;
      error?: string;
    }
  | {
      type: 'testEnd';
      testId: string;
      status: TestEndStatus;
      durationMs: number;
      retry: number;
      error?: string;
      testUrl?: string;
    }
  | { type: 'runEnd'; status: RunEndStatus };

export type TestEndStatus =
  | 'passed'
  | 'failed'
  | 'flaky'
  | 'skipped'
  | 'timedOut';
export type RunEndStatus = 'passed' | 'failed' | 'cancelled' | 'timedOut';
