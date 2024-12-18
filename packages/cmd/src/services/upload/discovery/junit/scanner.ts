import fs from 'fs-extra';

import { debug as _debug } from '@debug';
import { dim, error } from '@logger';
import { join } from 'path';
import { parseStringPromise } from 'xml2js';
import {
  TestCase,
  TestSuite,
  TestSuites,
} from '../../../../services/convert/types';
import {
  ensureArray,
  generateTestId,
  getSuiteName,
  getTestTitle,
} from '../../../../services/convert/utils';
import { FullSuiteProject, FullSuiteTest, FullTestSuite } from '../types';

const debug = _debug.extend('junit-discovery');

export async function jUnitScanner(reportDir: string) {
  console.time(dim('@currents/junit:fullTestSuite-ready'));

  try {
    debug('running scanner: %o', reportDir);

    // jUnitFile is the path to the JUnit xml file with all the tests suite and results
    const xmlFilePath = join(reportDir, 'currents.results.xml');

    // eslint-disable-next-line turbo/no-undeclared-env-vars
    process.env.CURRENTS_DISCOVERY_PATH = xmlFilePath;

    const fileContent = fs.readFileSync(xmlFilePath, 'utf-8');

    const jsonContent = await parseStringPromise(fileContent, {
      explicitArray: false,
      mergeAttrs: true,
    });

    return parseToFullTestSuite(jsonContent);
  } catch (err) {
    error('Failed to obtain the junit full test suite:', err);
    return [];
  }
}

function parseToFullTestSuite(jsonContent: TestSuites) {
  const fullTestSuite: FullTestSuite = [];

  const testsuites = ensureArray<TestSuite>(jsonContent.testsuites?.testsuite);

  const fullSuiteProject: FullSuiteProject = {
    name: jsonContent.testsuites?.name ?? 'No name',
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

  return fullTestSuite;
}
