import { generateShortHash } from '@lib/hash';
import { parseStringPromise } from 'xml2js';
import { InstanceReport, TestCase, TestSuite } from './types';
import { assertForArray, getSpec, getTestCase } from './utils';

export async function getPostmanInstances(combinedResult: string) {
  const instances: Map<string, InstanceReport> = new Map();
  const result = await parseStringPromise(combinedResult, {
    explicitArray: false,
    mergeAttrs: true,
  });

  if (!result) {
    console.error('Error parsing XML');
    return instances;
  }

  const testsuites = assertForArray(result.testsuites.testsuite) as TestSuite[];

  testsuites.forEach((suite: TestSuite) => {
    const startTime = new Date(suite?.timestamp ?? '');
    const durationMillis = parseFloat(suite?.time ?? '0') * 1000;
    const endTime = new Date(startTime.getTime() + durationMillis);

    const testcases = assertForArray(suite.testcase) as TestCase[];

    // Need this to sum each testcase time to the testsuite timestamp and see a difference in the startime
    let accumulatedTestTime = 0;

    const suiteJson = {
      groupId: result.testsuites.name,
      spec: getSpec(suite),
      worker: {
        workerIndex: 1,
        parallelIndex: 1,
      },
      startTime: startTime.toISOString(),
      results: {
        stats: {
          suites: 1,
          tests: parseInt(suite.tests ?? '0'),
          passes: testcases?.filter((tc) => !tc?.failure).length,
          pending: 0,
          skipped: 0,
          failures: testcases?.filter((tc) => tc?.failure).length,
          flaky: 0,
          wallClockStartedAt: startTime.toISOString(),
          wallClockEndedAt: endTime.toISOString(),
          wallClockDuration: durationMillis,
        },
        tests: testcases?.map((test) => {
          const newAccumulatedTestTime =
            accumulatedTestTime + parseFloat(testcases[0].time ?? '0') * 1000;
          accumulatedTestTime = newAccumulatedTestTime;
          return getTestCase(test, suite, newAccumulatedTestTime);
        }),
      },
    };

    const fileNameHash = generateShortHash(suite?.name ?? '');
    instances.set(fileNameHash, suiteJson);
  });

  return instances;
}
