import crypto from 'node:crypto';
import {
  ErrorSchema,
  InstanceReportTest,
  InstanceReportTestAttempt,
  TestCaseStatus,
  TestRunnerStatus,
} from '../../types';
import { Failure, TestCase, TestSuite } from './types';

export function getTestCase(
  testCase: TestCase,
  suite: TestSuite,
  time: number
): InstanceReportTest {
  const failures = ensureArray<string | Failure>(testCase.failure);
  const hasFailure = failures.length > 0;

  return {
    _t: getTimestampValue(suite?.timestamp ?? ''),
    testId: generateTestId(
      getTestTitle(testCase.name, suite.name).join(', '),
      suite.name ?? ''
    ),
    title: getTestTitle(testCase.name, suite.name),
    state: hasFailure ? 'failed' : 'passed',
    isFlaky: getTestFlakiness(),
    expectedStatus: hasFailure ? 'skipped' : 'passed',
    timeout: getTimeout(),
    location: getTestCaseLocation(suite?.file ?? ''),
    retries: getTestRetries(failures),
    attempts: getTestAttempts(testCase, failures, suite.timestamp ?? '', time),
  };
}

export function generateTestId(testName: string, suiteName: string): string {
  const combinedString = `${testName}${suiteName}`;
  const fullHash = crypto
    .createHash('sha256')
    .update(combinedString)
    .digest('hex');
  return fullHash.substring(0, 16);
}

function getTimestampValue(timestamp: string) {
  if (!isValidDate(timestamp)) {
    return 0;
  }
  return new Date(timestamp).getTime();
}

function isValidDate(dateString: string) {
  const date = new Date(dateString);
  return !isNaN(date.getTime());
}

export function getTestTitle(testName?: string, suiteName?: string): string[] {
  return [suiteName, testName].filter(Boolean) as string[];
}

function getTestFlakiness() {
  // The attempts concept has not been seen in the JUnit frameworks we tried so there's always a single attempt
  // No way to determine flakiness so far
  return false;
}

function getTimeout() {
  // No timeout property has been found in the example frameworks
  // The only way to determine a timeout is looking in the failure but is not very consistent way
  return 0;
}

function getTestCaseLocation(fileName: string) {
  // No way to determine column and line properties of a test in spec file
  return {
    column: 1,
    file: fileName,
    line: 1,
  };
}

function getTestRetries(failures: (Failure | string)[]) {
  // We can know the retries based on the failure tags in testcase
  // But if the final outcome of the retries is passed, then all the failure tags will be gone
  let retries = 0;
  failures.forEach((item) => {
    if (typeof item !== 'string') {
      retries++;
    }
  });
  return retries;
}

function getTestAttempts(
  testCase: TestCase,
  failures: (Failure | string)[],
  suiteTimestamp: string,
  time: number
): InstanceReportTestAttempt[] {
  const testCaseTime = timeToMilliseconds(testCase.time);
  if (failures.length === 0) {
    return [
      {
        _s: 'passed',
        attempt: 0,
        workerIndex: 1,
        parallelIndex: 1,
        startTime: suiteTimestamp,
        steps: [],
        duration: testCaseTime,
        status: 'passed',
        stdout: getStdOut(testCase?.['system-out']),
        stderr: [],
        errors: [],
        error: undefined,
      },
    ];
  }

  return failures.reduce<InstanceReportTestAttempt[]>((acc, item, index) => {
    if (item !== 'true' && item !== 'false') {
      const errors = getErrors(item);
      acc.push({
        _s: 'failed' as TestCaseStatus,
        attempt: index,
        workerIndex: 1,
        parallelIndex: 1,
        startTime: getTestStartTime(time, suiteTimestamp),
        steps: [],
        duration: testCaseTime,
        status: 'passed' as TestRunnerStatus,
        stdout: getStdOut(testCase?.['system-out']),
        stderr: getStdErr(testCase?.['system-err']),
        errors: errors,
        error: errors ? errors[0] : undefined,
      });
    }
    return acc;
  }, []);
}

function getStdOut(systemOut?: string) {
  return systemOut ? [systemOut] : [];
}

function getStdErr(systemErr?: string) {
  return systemErr ? [systemErr] : [];
}

function getErrors(failure: Failure | string): ErrorSchema[] {
  if (failure === 'true' || failure === 'false') {
    return [];
  }

  const error: ErrorSchema =
    typeof failure === 'string'
      ? { message: failure }
      : { message: failure.message, stack: failure._, value: failure.type };

  return [error];
}

function getTestStartTime(accTestTime: number, suiteTimestamp: string): string {
  const newStartTime = new Date(suiteTimestamp).getTime() + accTestTime;
  return new Date(newStartTime).toISOString();
}

export function ensureArray<T>(value: unknown): T[] {
  if (!value) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

export function secondsToMilliseconds(seconds: number) {
  return Math.round(seconds * 1000);
}

export function timeToMilliseconds(time?: string): number {
  return secondsToMilliseconds(parseFloat(time ?? '0'));
}

export function getSuiteName(suite: TestSuite, testSuites: TestSuite[]) {
  // There can be multiple testsuite with the same name but includes an ID to identify
  if (!suite.file && testSuites.find((item) => item.name === suite.name)) {
    return suite.id + ' / ' + suite.name;
  }

  if (suite.file) {
    return suite.file;
  }

  return suite.name ?? '';
}
