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
