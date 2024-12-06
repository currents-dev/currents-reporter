import { generateShortHash } from '@lib/hash';
import { error } from '@logger';
import { parseStringPromise } from 'xml2js';
import { InstanceReport } from '../../../types';
import { TestCase, TestSuite } from '../types';
import {
  ensureArray,
  getSpec,
  getTestCase,
  timeToMilliseconds,
} from '../utils';

export async function getInstanceMap(
  xmlInput: string
): Promise<Map<string, InstanceReport>> {
  const instances: Map<string, InstanceReport> = new Map();
  const parsedXMLInput = await parseStringPromise(xmlInput, {
    explicitArray: false,
    mergeAttrs: true,
  });

  if (!parsedXMLInput) {
    error('Failed to parse XML input');
    return new Map();
  }

  const testsuites = ensureArray<TestSuite>(
    parsedXMLInput.testsuites?.testsuite
  );

  const groupId = parsedXMLInput.testsuites.name;

  testsuites.forEach((suite: TestSuite) => {
    const suiteJson = createSuiteJson(suite, groupId);
    const fileNameHash = generateShortHash(suite?.name ?? '');
    
    // Avoid creating testless instance files as the full test suite won't have it
    if (suiteJson.results.tests.length !== 0) {
      instances.set(fileNameHash, suiteJson);
    }
  });

  return instances;
}

function createSuiteJson(suite: TestSuite, groupId: string) {
  const startTime = new Date(suite?.timestamp ?? '');
  const durationMillis = timeToMilliseconds(suite?.time);
  const endTime = new Date(startTime.getTime() + durationMillis);
  const testcases = ensureArray<TestCase>(suite.testcase);

  let accTestTime = 0;

  const suiteJson: InstanceReport = {
    groupId,
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
        accTestTime += timeToMilliseconds(testcases[0]?.time);
        return getTestCase(test, suite, accTestTime);
      }),
    },
  };

  return suiteJson;
}
