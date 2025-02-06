// possible currents test case statuses from reported results
export type TestCaseStatus = 'passed' | 'failed' | 'pending';

// currents values suitable for jest status
export type TestRunnerStatus = 'passed' | 'failed' | 'skipped';

// currents values suitable for jest expected status
export type ExpectedStatus = 'passed' | 'pending' | 'failed';

// jest test case statuses available in results
export type JestTestCaseStatus = 'pending' | 'todo' | 'failed' | 'passed';

export type InstanceReportStats = {
  suites: number;
  tests: number;
  passes: number;
  pending: number;
  skipped: number;
  failures: number;
  flaky: number;
  wallClockStartedAt: string;
  wallClockEndedAt: string;
  wallClockDuration: number;
};

export type ErrorSchema = {
  message?: string;
  stack?: string;
  value?: string;
  snippet?: string;
  location?: LocationSchema;
};

export type LocationSchema = {
  line: number;
  column: number;
  file: string;
};

export type InstanceReportTestAttempt = {
  _s: TestCaseStatus;
  attempt: number;

  startTime: string;
  steps: unknown[];

  duration: number;
  status: TestRunnerStatus;

  stderr: string[];
  stdout: string[];

  errors: ErrorSchema[];
  error?: ErrorSchema;
};

export type InstanceReportTest = {
  _t: number;
  testId: string;
  title: string[];
  state: TestCaseStatus;
  isFlaky?: boolean;
  retries: number;
  expectedStatus?: ExpectedStatus;
  annotations?: unknown[];
  timeout: number;
  location: LocationSchema;
  attempts: InstanceReportTestAttempt[];
};

export type InstanceReport = {
  groupId: string;
  spec: string;
  startTime: string;
  results: {
    error?: string;
    exception?: string | null;
    stats: InstanceReportStats;
    tests: InstanceReportTest[];
  };
};
