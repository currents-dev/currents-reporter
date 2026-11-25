/**
 * Events consumed by the terminal reporter. Local mode (Playwright reporter
 * hooks) and remote mode (`currents watch`) both produce this stream.
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
      status: TestStatus;
      durationMs: number;
      retry: number;
      error?: string;
      testUrl?: string;
    }
  | { type: 'runEnd'; status: RunStatus };

export type TestStatus = 'passed' | 'failed' | 'flaky' | 'skipped' | 'timedOut';
export type RunStatus = 'passed' | 'failed' | 'cancelled' | 'timedOut';

export type StepState = {
  stepId: string;
  title: string;
  category?: string;
  location?: { file: string; line: number };
};

export type TestState = {
  testId: string;
  title: string[];
  file: string;
  project?: string;
  worker: string;
  retry: number;
  /** Open steps, outermost first. The last one is the current step. */
  steps: StepState[];
  status: 'running' | TestStatus;
  durationMs?: number;
  error?: string;
  testUrl?: string;
};

export type TerminalRunState = {
  totalTests: number;
  startedAt?: number;
  runUrl?: string;
  status: 'pending' | 'running' | RunStatus;
  tests: Record<string, TestState>;
  /** Worker id to the test it runs, or null when idle. Insertion ordered. */
  workers: Record<string, string | null>;
  /** Test ids in the order they finished; a retried test moves to the end. */
  finished: string[];
  counts: Record<TestStatus, number>;
};
