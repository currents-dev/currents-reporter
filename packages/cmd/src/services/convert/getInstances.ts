import * as xml2js from 'xml2js';
import { Failure, TestSuite, TestSuites } from './combineInputFiles';
import { generateTestId } from 'services/upload/discovery/junit/scanner';
import { generateShortHash } from '@lib/hash';
import * as fs from 'fs';
import { ConvertCommandConfig } from 'config/convert';
import {
  ExpectedStatus,
  InstanceReport,
  TestCaseStatus,
  TestRunnerStatus,
} from './types';

export async function getInstances(
  combinedResult: string,
  config: ConvertCommandConfig
) {
  const instances: Map<string, InstanceReport> = new Map();
  xml2js.parseString(
    combinedResult,
    { explicitArray: true, mergeAttrs: true },
    (err, result) => {
      if (err) {
        console.error('Error parsing XML:', err);
        return;
      }
      const rootSuite: TestSuites = result.testsuites;

      const testsuites = Array.isArray(result.testsuites.testsuite)
        ? result.testsuites.testsuite
        : [result.testsuites.testsuite];

      testsuites.forEach((suite: TestSuite) => {
        const startTime = new Date(suite?.timestamp ?? '');
        const durationMillis = parseFloat(suite?.time ?? '0') * 1000;
        const endTime = new Date(startTime.getTime() + durationMillis);

        const testcases = Array.isArray(suite.testcase)
          ? suite.testcase
          : [suite.testcase];

        const suiteJson = {
          groupId: result.testsuites.name,
          spec: suite.file ?? suite.name,
          worker: {
            workerIndex: 1,
            parallelIndex: 1,
          },
          startTime: suite?.timestamp ?? '',
          results: {
            stats: {
              suites: testcases.length,
              tests: parseInt(suite.tests ?? '0'),
              passes: testcases.filter((tc) => !tc?.failure).length,
              pending: 0,
              skipped: 0,
              failures: testcases.filter((tc) => tc?.failure).length,
              flaky: 0,
              wallClockStartedAt: suite?.timestamp ?? '',
              wallClockEndedAt: endTime.toISOString(),
              wallClockDuration: durationMillis,
            },
            tests: testcases.map((test) => {
              const hasFailure = test?.failure && test?.failure !== 'false';
              return {
                _t: Date.now(),
                testId: generateTestId(test?.name ?? '', suite?.name ?? ''),
                title: [test?.name ?? ''],
                state: (hasFailure ? 'failed' : 'passed') as TestCaseStatus,
                isFlaky: false,
                expectedStatus: (hasFailure
                  ? 'skipped'
                  : 'passed') as ExpectedStatus,
                timeout: 0,
                location: {
                  column: 1,
                  file: suite?.file ?? suite?.name,
                  line: 1,
                },
                retries: 1,
                attempts: [
                  {
                    _s: (hasFailure ? 'failed' : 'passed') as TestCaseStatus,
                    attempt: 1,
                    workerIndex: 1,
                    parallelIndex: 1,
                    startTime: suite?.timestamp ?? '',
                    steps: [],
                    duration: parseFloat(test?.time ?? '0') * 1000,
                    status: (hasFailure
                      ? 'failed'
                      : 'passed') as TestRunnerStatus,
                    stdout: test?.['system-out'] ? [test?.['system-out']] : [],
                    stderr: hasFailure ? extractFailure(test?.failure) : [],
                    errors: hasFailure
                      ? [
                          mergeFailuresIntoMessage(
                            extractFailure(test?.failure)
                          ) ?? {},
                        ]
                      : [],
                    error: hasFailure
                      ? mergeFailuresIntoMessage(
                          extractFailure(test?.failure)
                        ) ?? {}
                      : {},
                  },
                ],
              };
            }),
          },
        };

        const fileNameHash = generateShortHash(suite?.name ?? '');

        fs.writeFileSync(
          `${config.outputDir}/${fileNameHash}.json`,
          JSON.stringify(suiteJson, null, 2),
          'utf8'
        );
        instances.set(fileNameHash, suiteJson);
      });
    }
  );
  return instances;
}

function extractFailure(failure: any) {
  const failureArray = [];
  if (failure?.message) {
    failureArray.push(failure?.message);
  }
  if (failure?._) {
    failureArray.push(failure?._);
  }
  if (Array.isArray(failure)) {
    let failureItem;
    for (let i = 0; i < failure.length; i++) {
      if (typeof failure[i] === 'object' && failure[i] !== null) {
        failureItem = failure[i];
        break;
      }
    }
    return extractFailure(failureItem);
  }
  return failureArray;
}

function mergeFailuresIntoMessage(failuresArray: string[]) {
  if (!failuresArray) {
    return;
  }
  if (failuresArray.length === 0) {
    return;
  }
  return {
    message: failuresArray.join(', '),
  };
}
