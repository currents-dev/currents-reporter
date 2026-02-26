// possible currents test case statuses from reported results
export type TestCaseStatus = 'passed' | 'failed' | 'pending';

// currents values suitable for jest status
export type TestRunnerStatus = 'passed' | 'failed' | 'skipped';

// currents values suitable for jest expected status
export type ExpectedStatus = 'passed' | 'skipped';

// jest test case statuses available in results
export type JestTestCaseStatus = 'pending' | 'todo' | 'failed' | 'passed';

export type ArtifactType = 'screenshot' | 'video' | 'trace' | 'attachment' | 'stdout' | 'coverage';

export type ArtifactLevel = 'spec' | 'test' | 'attempt';

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

export interface Artifact {
  path: string;
  type: ArtifactType;
  contentType: string;
  name?: string;
  metadata?: Record<string, string>;
  level?: ArtifactLevel;
  attempt?: number;
}

export type InstanceReportTestAttempt = {
  _s: TestCaseStatus;
  attempt: number;

  startTime: string;
  steps: unknown[];

  duration: number;
  status: TestRunnerStatus;

  stderr: string[];
  stdout: string[];
  artifacts?: Artifact[];

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
  artifacts?: Artifact[];
  attempts: InstanceReportTestAttempt[];
};

export type InstanceReport = {
  groupId: string;
  spec: string;
  startTime: string;
  artifacts?: Artifact[];
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
