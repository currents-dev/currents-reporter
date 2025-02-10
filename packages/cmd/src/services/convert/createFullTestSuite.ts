import {
  FullSuiteProject,
  FullSuiteTest,
  FullTestSuite,
} from '../upload/discovery';
import { TestCase, TestSuite, TestSuites } from './types';
import {
  ensureArray,
  generateTestId,
  getSuiteName,
  getTestTitle,
} from './utils';

export function createFullTestSuite(parsedXMLInputs: TestSuites[]) {
  const fullTestSuite: FullTestSuite = [];

  parsedXMLInputs.forEach((item) => {
    const testsuites = ensureArray<TestSuite>(item.testsuites?.testsuite);

    const fullSuiteProject: FullSuiteProject = {
      name: item.testsuites?.name ?? 'No name',
      tags: [],
      tests: [],
    };

    testsuites?.forEach((suite) => {
      const suiteName = getSuiteName(suite, testsuites);
      const testcases = ensureArray<TestCase>(suite?.testcase);

      testcases?.forEach((testcase) => {
        const fullSuiteTest: FullSuiteTest = {
          title: getTestTitle(testcase.name, suiteName),
          spec: suiteName,
          tags: [],
          testId: generateTestId(
            getTestTitle(testcase.name, suiteName).join(', '),
            suiteName
          ),
        };

        fullSuiteProject.tests.push(fullSuiteTest);
      });
    });
    fullTestSuite.push(fullSuiteProject);
  });

  return fullTestSuite;
}
