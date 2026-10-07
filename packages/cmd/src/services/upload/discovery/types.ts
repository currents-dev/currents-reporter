export type FullTestSuite = FullSuiteProject[];

export type FullSuiteProject = {
  name: string;
  tags: string[];
  tests: FullSuiteTest[];
};

export type FullSuiteTest = {
  title: string[];
  spec: string;
  tags: string[];
  testId: string;
};

// What the discovery reporter writes: the tests it listed, and the test files
// that failed to load, which have no tests in the list.
export type JestDiscoveryResult = {
  fullTestSuite: FullTestSuite;
  specsWithoutResults: { projectId: string; spec: string; message: string }[];
};
