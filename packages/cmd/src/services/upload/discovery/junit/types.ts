type Property = {
  name?: string;
  value?: string;
  _?: string;
};

type TestCase = {
  name?: string;
  classname?: string;
  assertions?: string;
  time?: string;
  file?: string;
  line?: string;
  skipped?: {
    message?: string;
  };
  failure?: {
    message?: string;
    type?: string;
  };
  error?: {
    message?: string;
    type?: string;
  };
  'system-out'?: string;
  'system-err'?: string;
  properties?: {
    property?: Property[];
  };
};

type TestSuite = {
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
};

type TestSuites = {
  name?: string;
  tests?: string;
  failures?: string;
  errors?: string;
  skipped?: string;
  assertions?: string;
  time?: string;
  timestamp?: string;
  testsuite?: TestSuite | TestSuite[]; // Can be a single TestSuite or an array of TestSuite objects
};

export type JUnitCompleteStructure = {
  testsuites?: TestSuites;
};
