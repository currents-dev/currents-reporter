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


