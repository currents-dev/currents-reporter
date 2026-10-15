import { generateShortHash } from '@lib/hash';
import { InstanceReport } from '../../../types';
import {
  createSuiteJson,
  getInstanceMap as getSuiteInstanceMap,
} from '../postman';
import { TestCase, TestSuite, TestSuites } from '../types';
import { ensureArray, generateCypressTestId } from '../utils';

/**
 * Cypress's built-in `junit` reporter (mocha-junit-reporter) writes one report
 * per spec file when `mochaFile` contains `[hash]`. Only the first <testsuite>
 * ("Root Suite") has the spec file path; each describe block is a separate
 * <testsuite> without it. This joins all suites of a report into one spec.
 */
export async function getInstanceMap(
  parsedXMLArray: TestSuites[]
): Promise<Map<string, InstanceReport>> {
  const instances: Map<string, InstanceReport> = new Map();

  for (const item of parsedXMLArray) {
    const testsuites = ensureArray<TestSuite>(item.testsuites?.testsuite);
    const spec = testsuites.find((suite) => suite.file)?.file;

    if (!spec) {
      const suiteInstances = await getSuiteInstanceMap([item]);
      suiteInstances.forEach((instance, key) => instances.set(key, instance));
      continue;
    }

    const groupId = item.testsuites?.name ?? 'No name';
    const testcases = testsuites.flatMap((suite) =>
      ensureArray<TestCase>(suite.testcase)
    );
    const suiteJson = createSuiteJson(
      {
        ...testsuites[0],
        file: spec,
        timestamp: asUTC(testsuites[0].timestamp),
        time: item.testsuites?.time,
        testcase: testcases,
      },
      groupId,
      spec
    );
    suiteJson.results.tests.forEach((test, index) => {
      test.title = getTestTitle(testcases[index]);
      test.testId = generateCypressTestId(test.title, spec);
    });

    if (suiteJson.results.tests.length !== 0) {
      instances.set(generateShortHash(groupId + spec), suiteJson);
    }
  }

  return instances;
}

// mocha-junit-reporter writes the full title ("Login password hides the
// password") as `name` and the test's own title ("hides the password") as
// `classname`. The describe block titles are joined with spaces, so they
// cannot be split further.
function getTestTitle({ name = '', classname = '' }: TestCase) {
  if (!classname || !name.endsWith(classname)) {
    return [name || classname];
  }
  const describeTitles = name.slice(0, -classname.length).trim();
  return [describeTitles, classname].filter(Boolean);
}

// mocha-junit-reporter writes UTC timestamps without a time zone, e.g.
// "2026-10-13T16:03:45", which `new Date()` reads as local time.
function asUTC(timestamp?: string) {
  if (!timestamp || /(Z|[+-]\d\d:?\d\d)$/.test(timestamp)) {
    return timestamp;
  }
  return `${timestamp}Z`;
}
