import { describe, it, expect, beforeEach } from 'vitest';
import { getInstanceMap } from '../postman';
import { InstanceReport } from 'types';

describe('getInstanceMap', () => {
  const xmlInput = `
    <testsuites name="Test Collection" tests="4" failures="0" errors="0" time="200">
      <testsuite name="Test Suite 1" timestamp="2024-12-20T22:12:47.937Z" tests="2" failures="0" errors="0" skipped="0" time="10">
        <testcase classname="path/to/file.test.ts" name="Test Case 1" time="3"/>
        <testcase classname="path/to/file.test.ts" name="Test Case 2" time="7"/>
      </testsuite>
      <testsuite name="Test Suite 2" timestamp="2024-12-20T22:12:57.937Z" tests="2" failures="0" errors="0" skipped="0" time="42">
        <testcase classname="path/to/file.test.ts" name="Test Case 3" time="12"/>
        <testcase classname="path/to/file.test.ts" name="Test Case 4" time="30"/>
      </testsuite>
    </testsuites>
  `;

  let instanceMap: Map<string, InstanceReport>;

  function getTestEntry(
    instanceMap: Map<string, InstanceReport>,
    testName: string
  ) {
    return Array.from(instanceMap.values()).find(instance =>
      instance.results.tests.some(test => test.title.includes(testName))
    );
  }

  beforeEach(async () => {
    instanceMap = await getInstanceMap(xmlInput);
  });

  it('returns a map of instances', () => {
    expect(instanceMap.size).toBe(2);
  });

  it.each([
    'Test Suite 1',
    'Test Suite 2',
  ])('matches snapshot for %s', testSuiteName => {
    expect(getTestEntry(instanceMap, testSuiteName)).toMatchSnapshot();
  });
});
