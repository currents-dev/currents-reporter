import { generateShortHash } from '@lib/hash';
import { InstanceReport } from '../../../types';
import { TestCase, TestSuite, TestSuites } from '../types';
import {
  ensureArray,
  getISODateValue,
  getSuiteName,
  getTestCase,
  getTimestampValue,
  timeToMilliseconds,
} from '../utils';

export async function getInstanceMap(
  parsedXMLArray: TestSuites[]
): Promise<Map<string, InstanceReport>> {
  const instances: Map<string, InstanceReport> = new Map();

  parsedXMLArray.forEach((item) => {
    const testsuites = ensureArray<TestSuite>(item.testsuites?.testsuite);

    const groupId = item.testsuites?.name ?? 'No name';

    testsuites.forEach((suite: TestSuite, index) => {
      const suiteName = getSuiteName(suite, testsuites, index);
      const suiteJson = createSuiteJson(suite, groupId, suiteName);
      const fileNameHash = generateShortHash(groupId + suiteName);

      // Avoid creating testless instance files as the full test suite won't have it
      if (suiteJson.results.tests.length !== 0) {
        instances.set(fileNameHash, suiteJson);
      }
    });
  });

  return instances;
}

export function createSuiteJson(
  suite: TestSuite,
  groupId: string,
  suiteName: string
) {
  const startTime = getISODateValue(suite.timestamp ?? '');
  const durationMillis = suite.time ? timeToMilliseconds(suite.time) : 0;
  const endTime = new Date(
    getTimestampValue(suite.timestamp ?? '') + durationMillis
  );
  const testcases = ensureArray<TestCase>(suite.testcase);

  let accTestTime = 0;

  const failures = testcases.filter((tc) => 'failure' in tc).length;
  const skipped = testcases.filter((tc) => 'skipped' in tc).length;
  const passes = testcases.length - failures - skipped;

  const suiteJson: InstanceReport = {
    groupId,
    spec: suiteName,
    startTime,
    results: {
      stats: {
        suites: 1,
        tests: testcases.length,
        passes,
        pending: skipped,
        skipped: 0,
        failures,
        flaky: 0,
        wallClockStartedAt: startTime,
        wallClockEndedAt: endTime.toISOString(),
        wallClockDuration: durationMillis,
      },
      tests: testcases?.map((test) => {
        if (testcases[0]?.time) {
          accTestTime += timeToMilliseconds(testcases[0].time);
        }
        return getTestCase(test, suite, accTestTime, suiteName);
      }),
    },
  };

  return suiteJson;
}
