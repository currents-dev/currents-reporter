export enum TestState {
  Failed = "failed",
  Passed = "passed",
  Pending = "pending",
  Skipped = "skipped",
}

export enum TestExpectedStatus {
  Passed = "passed",
  Failed = "failed",
  TimedOut = "timedOut",
  Skipped = "skipped",
  Interrupted = "interrupted",
}

export type InstanceReportStats = {
  suites: number;
  tests: number;
  passes: number;
  pending: number;
  skipped: number;
  failures: number;
  flaky: number;
  wallClockStartedAt: string | null;
  wallClockEndedAt: string | null;
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

export type WorkerInfo = {
  workerIndex: number;
  parallelIndex: number;
};

export type InstanceReportTestAttempt = {
  _s: TestState;
  attempt: number;
  workerIndex: number;
  parallelIndex: number;

  startTime: string;
  steps: unknown[];

  duration: number;
  status: TestExpectedStatus;

  stderr?: string[];
  stdout?: string[];

  errors?: ErrorSchema[];
  error?: ErrorSchema;
};

export type InstanceReportTest = {
  _t: number;
  testId: string;
  title: string[];
  state: TestState;
  isFlaky?: boolean;
  retries: number;
  expectedStatus?: TestExpectedStatus;
  annotations?: unknown[];
  timeout: number;
  location: LocationSchema;
  attempts: InstanceReportTestAttempt[];
};

export type InstanceReport = {
  groupId: string;
  spec: string;
  worker: WorkerInfo;
  startTime: string;
  results: {
    error?: string;
    exception?: string | null;
    stats: InstanceReportStats;
    tests: InstanceReportTest[];
  };
};

export type CLIArgs = {
  options: Record<string, unknown>;
  args: string[];
};

export type ReportConfig = {
  framework: string;
  frameworkVersion: string | null;
  cliArgs: CLIArgs;
  frameworkConfig: Record<string, unknown>;
};

export type ReportOptions = {
  configFilePath?: string;
  reportDir?: string;
};

export type UploadMarkerInfo = {
  response: {
    runUrl: string;
    runId: string;
  };
  isoDate: string;
};
