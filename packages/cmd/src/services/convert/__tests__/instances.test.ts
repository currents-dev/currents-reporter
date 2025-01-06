import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InstanceReport } from '../../../types';
import { createSuiteJson, getInstanceMap } from '../postman/instances';
import { timeToMilliseconds } from '../utils';
import { mockDate } from './fixtures';

describe('getInstanceMap', () => {
  it('should return an empty Map when the XML input is empty', async () => {
    expect(await getInstanceMap('')).toEqual(new Map());
  });

  it('should return an empty Map when the test suite array is empty', async () => {
    expect(await getInstanceMap('<testsuites></testsuites>')).toEqual(
      new Map()
    );
  });

  it('should return an empty Map when instances have no tests', async () => {
    expect(
      await getInstanceMap('<testsuites><testsuite></testsuite></testsuites>')
    ).toEqual(new Map());
  });

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
    return Array.from(instanceMap.values()).find((instance) =>
      instance.results.tests.some((test) => test.title.includes(testName))
    );
  }

  beforeEach(async () => {
    instanceMap = await getInstanceMap(xmlInput);
  });

  it('returns a map of instances', () => {
    expect(instanceMap.size).toBe(2);
  });

  it.each(['Test Suite 1', 'Test Suite 2'])(
    'matches snapshot for %s',
    (testSuiteName) => {
      expect(getTestEntry(instanceMap, testSuiteName)).toMatchSnapshot();
    }
  );
});

describe('createSuiteJson', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(mockDate);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const groupId = 'groupId-1';
  const spec = 'Suite 1';
  const classname = 'TestClass';
  const failureMessage = 'Error';

  const baseSuite = {
    id: '1',
    name: 'Test Suite 1',
    tests: '2',
    failures: '1',
    errors: '0',
    skipped: '0',
    assertions: '2',
    timestamp: '2024-12-28T12:00:00Z',
    testcase: [
      {
        name: 'Test 1',
        classname,
        time: '5.000',
        failure: [{ message: failureMessage }],
      },
      { name: 'Test 2', classname, time: '3.000', failure: [] },
    ],
  };

  it.each([
    [
      'should set the start time to the current date when the suite timestamp is not provided',
      {
        ...baseSuite,
        timestamp: undefined,
      },
      (suiteJson: InstanceReport) => {
        const currentDate = new Date().toISOString();
        expect(new Date(suiteJson.startTime).getTime()).toEqual(
          new Date(currentDate).getTime()
        );
      },
    ],
    [
      'should set the duration to 0 when the suite time is not provided',
      {
        ...baseSuite,
        time: undefined,
      },
      (suiteJson: InstanceReport) => {
        expect(suiteJson.results.stats.wallClockDuration).toBe(0);
      },
    ],
    [
      'should set the test cases to an empty array when the suite does not have test cases',
      {
        ...baseSuite,
        tests: '0',
        failures: '0',
        errors: '0',
        skipped: '0',
        assertions: '0',
        testcase: [],
      },
      (suiteJson: InstanceReport) => {
        expect(suiteJson.results.tests).toEqual([]);
      },
    ],
    [
      'should set the stats.tests to the number of suite tests when the suite has a tests field',
      {
        ...baseSuite,
        tests: '3',
        assertions: '3',
        testcase: [
          ...baseSuite.testcase,
          { name: 'Test 3', classname, time: '2.000', failure: [] },
        ],
      },
      (suiteJson: InstanceReport) => {
        expect(suiteJson.results.stats.tests).toBe(3);
      },
    ],
    [
      'should set the stats.passes to the number of test cases without failures',
      {
        ...baseSuite,
        tests: '3',
        assertions: '3',
        testcase: [
          {
            name: 'Test 1 - Failure',
            classname,
            time: '5.000',
            failure: [{ message: failureMessage }],
          },
          { name: 'Test 2 - Passed', classname, time: '3.000', failure: [] },
          { name: 'Test 3 - Passed', classname, time: '2.000', failure: [] },
        ],
      },
      (suiteJson: InstanceReport) => {
        expect(suiteJson.results.stats.passes).toBe(2);
      },
    ],
    [
      'should set the correct values for suite fields',
      baseSuite,
      (suiteJson: InstanceReport) => {
        const startTime = new Date(suiteJson.startTime).getTime();
        const expectedEndTime = startTime + timeToMilliseconds('0.01');
        expect(
          new Date(suiteJson.results.stats.wallClockEndedAt).getTime()
        ).toBeCloseTo(expectedEndTime, -3);
        expect(suiteJson.groupId).toBe(groupId);
        expect(suiteJson.spec).toBe(spec);
        expect(suiteJson.results.stats.failures).toBe(1);
      },
    ],
  ])('%s', async (_, suite, assertion) => {
    const suiteJson = createSuiteJson(suite, groupId, spec);
    assertion(suiteJson);
  });
});
