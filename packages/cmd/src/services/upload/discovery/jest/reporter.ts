import { debug as _debug } from '@debug';
import {
  AggregatedResult,
  Reporter,
  Test,
  TestContext,
  TestResult,
} from '@jest/reporters';
import fs from 'fs-extra';
import {
  getDefaultProjectId,
  getProjectId,
  getTestCaseFullTitle,
  getTestCaseId,
  getTestTags,
  testToSpecName,
} from './utils/test';

import { dim } from '@logger';
import { FullSuiteProject, FullSuiteTest, JestDiscoveryResult } from '../types';

const debug = _debug.extend('jest-discovery');

export default class DiscoveryReporter implements Reporter {
  private specsWithoutResults: JestDiscoveryResult['specsWithoutResults'] = [];
  private fullTestSuite: Record<
    string,
    Omit<FullSuiteProject, 'tests'> & {
      tests: FullSuiteTest[];
    }
  > = {};

  onRunStart(results: AggregatedResult) {
    debug('onRunStart, results: %O', results);
    console.time(dim('@currents/jest-discovery'));
  }

  onTestFileResult(test: Test, testResult: TestResult): Promise<void> | void {
    const projectId = getProjectId(test);

    if (!this.fullTestSuite[projectId]) {
      this.fullTestSuite[projectId] = {
        name: projectId,
        tags: [],
        tests: [],
      };
    }

    const spec = testToSpecName(test);
    debug('onTestFileResult [%s][%s]', projectId, spec);

    if (testResult.testResults.length === 0) {
      debug(
        'Failed to obtain spec results, error:',
        spec,
        testResult.failureMessage
      );
      this.specsWithoutResults.push({
        projectId,
        spec,
        message: testResult.failureMessage ?? '',
      });
    } else {
      this.fullTestSuite[projectId].tests.push(
        ...testResult.testResults.map((tc) => {
          const title = getTestCaseFullTitle(tc);
          return {
            spec,
            tags: getTestTags(title),
            testId: getTestCaseId(test, tc),
            title,
          };
        })
      );
    }
  }

  async onRunComplete(
    testContexts: Set<TestContext>,
    aggregatedResults: AggregatedResult
  ): Promise<void> {
    const filePath = process.env.CURRENTS_DISCOVERY_PATH;
    if (!filePath) {
      throw new Error('CURRENTS_DISCOVERY_PATH is not set');
    }

    const result: JestDiscoveryResult = {
      fullTestSuite: this.getFullTestSuite(testContexts),
      specsWithoutResults: this.specsWithoutResults,
    };
    debug('onRunComplete %s, %o', filePath, result);

    await fs.writeFile(filePath, JSON.stringify(result), 'utf8');

    console.timeEnd(dim('@currents/jest-discovery'));
  }

  // this is required to prevent different projectId in the full test suite and reported results
  private getFullTestSuite(testContexts: Set<TestContext>) {
    const fullTestSuite = Object.values(this.fullTestSuite);

    const oneProject = fullTestSuite.length === 1;
    const projectNameIsGeneratedId =
      fullTestSuite.length > 0 &&
      testContexts.size > 0 &&
      [...testContexts][0].config.id === fullTestSuite[0].name;

    if (oneProject && projectNameIsGeneratedId) {
      fullTestSuite[0].name = getDefaultProjectId();
    }

    return fullTestSuite;
  }
}
