// possible currents test case statuses from reported results
export type TestCaseStatus = 'passed' | 'failed' | 'pending';

// currents values suitable for jest status
export type TestRunnerStatus = 'passed' | 'failed' | 'skipped';

// currents values suitable for jest expected status
export type ExpectedStatus = 'passed' | 'skipped';

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

export type WorkerInfo = {
  workerIndex: number;
  parallelIndex: number;
};

export type InstanceReportTestAttempt = {
  _s: TestCaseStatus;
  attempt: number;
  workerIndex: number;
  parallelIndex: number;

  startTime: string;
  steps: unknown[];

  duration: number;
  status: TestRunnerStatus;

  stderr?: string[];
  stdout?: string[];

  errors?: ErrorSchema[];
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
  worker: WorkerInfo;
  startTime: string;
  results: {
    error?: string;
    exception?: string | null;
    stats: InstanceReportStats;
    tests: InstanceReportTest[];
  };
};

export type ReportConfig = {
  framework: string;
  frameworkVersion: string | null;
  cliArgs: Record<string, unknown>;
  frameworkConfig: Record<string, unknown>;
};

export interface Failure {
  message?: string;
  _?: string;
  type?: string;
}

export interface TestCase {
  name?: string;
  classname?: string;
  time?: string;
  failure?: (Failure | string)[];
  'system-out'?: string;
  'system-err'?: string;
  [key: string]: any;
}

export interface Property {
  name?: string;
  value?: string;
  _?: string;
}

export interface TestSuite {
  name?: string;
  tests?: string;
  failures?: string;
  errors?: string;
  skipped?: string;
  assertions?: string;
  time?: string;
  timestamp?: string;
  file?: string;
  properties?: {
    property?: Property[];
  };
  'system-out'?: string;
  'system-err'?: string;
  testcase?: TestCase[];
}

export interface TestSuites {
  testsuites?: {
    name?: string;
    tests?: string;
    failures?: string;
    errors?: string;
    skipped?: string;
    assertions?: string;
    time?: string;
    timestamp?: string;
    testsuite?: TestSuite[];
    [key: string]: any;
  };
}
