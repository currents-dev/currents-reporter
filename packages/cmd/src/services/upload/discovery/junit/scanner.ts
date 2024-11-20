import { Config } from '@jest/types';
import fs from 'fs-extra';

import { debug as _debug } from '@debug';
import { dim, error } from '@logger';
import crypto from 'node:crypto';
import { parseStringPromise } from 'xml2js';
import { CLIArgs } from '../../types';
import { FullSuiteProject, FullSuiteTest, FullTestSuite } from '../types';
import { JUnitCompleteStructure } from './types';

const debug = _debug.extend('junit-discovery');

export async function jUnitScanner(
  _config: Config.GlobalConfig,
  cliArgsFromConfig: CLIArgs
) {
  console.time(dim('@currents/junit:fullTestSuite-ready'));

  try {
    debug('running scanner: %o', cliArgsFromConfig);

    // jUnitFile is the path to the JUnit xml file with all the tests suite and results
    const xmlFilePath = cliArgsFromConfig.options['jUnitFile'] as string;

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

function parseToFullTestSuite(jsonContent: JUnitCompleteStructure) {
  const fullTestSuite: FullTestSuite = [];

  const testsuites = jsonContent.testsuites?.testsuite;

  const suiteArray = Array.isArray(testsuites) ? testsuites : [testsuites];

  const fullSuiteProject: FullSuiteProject = {
    name: jsonContent.testsuites?.name ?? 'No name',
    tags: [],
    tests: [],
  };

  suiteArray.forEach((suite) => {
    const testcases = suite?.testcase;
    const testcaseArray = Array.isArray(testcases) ? testcases : [testcases];

    testcaseArray.forEach((testcase) => {
      const fullSuiteTest: FullSuiteTest = {
        title: [testcase?.name ?? ''],
        spec: suite?.name ?? 'No name',
        tags: [],
        testId: generateTestId(
          testcase?.name ?? 'No name',
          suite?.name ?? 'No name'
        ),
      };

      fullSuiteProject.tests.push(fullSuiteTest);
    });
  });
  fullTestSuite.push(fullSuiteProject);

  return fullTestSuite;
}

export function generateTestId(testName: string, suiteName: string): string {
  const combinedString = `${testName}${suiteName}`;
  const fullHash = crypto
    .createHash('sha256')
    .update(combinedString)
    .digest('hex');
  return fullHash.substring(0, 16);
}
