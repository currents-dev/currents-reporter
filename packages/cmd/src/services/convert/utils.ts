import { isNumber } from 'lodash';
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
  time: number,
  suiteName: string
): InstanceReportTest {
  const failures = ensureArray<string | Failure>(testCase.failure);
  const hasFailure = failures.length > 0;
  const suiteTimestamp = suite?.timestamp ?? '';
  const skipped = 'skipped' in testCase;

  const state = skipped ? 'pending' : hasFailure ? 'failed' : 'passed';

  return {
    _t: getTimestampValue(suiteTimestamp),
    testId: generateTestId(
      getTestTitle(testCase.name, suiteName).join(', '),
      suiteName
    ),
    title: getTestTitle(testCase.name, suiteName),
    state: state,
    isFlaky: getTestFlakiness(),
    expectedStatus: 'passed',
    timeout: getTimeout(),
    location: getTestCaseLocation(suite?.file ?? ''),
    retries: getTestRetries(failures),
    attempts: getTestAttempts(
      testCase,
      failures,
      getISODateValue(suiteTimestamp),
      time,
      skipped
    ),
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

export function getTimestampValue(dateString: string) {
  if (!isValidDate(dateString)) {
    return new Date().getTime();
  }
  return new Date(dateString).getTime();
}

export function getISODateValue(dateString: string) {
  if (!isValidDate(dateString)) {
    return new Date().toISOString();
  }
  return new Date(dateString).toISOString();
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
  time: number,
  skipped?: boolean
): InstanceReportTestAttempt[] {
  const testCaseTime = testCase.time ? timeToMilliseconds(testCase.time) : 0;
  if (skipped) {
    return [
      {
        _s: 'pending',
        attempt: 0,
        startTime: suiteTimestamp,
        steps: [],
        duration: testCaseTime,
        status: 'skipped',
        stdout: getStdOut(testCase?.['system-out']),
        stderr: [],
        errors: [],
        error: undefined,
      },
    ];
  }
  if (failures.length === 0) {
    return [
      {
        _s: 'passed',
        attempt: 0,
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

  return failures.reduce<InstanceReportTestAttempt[]>(
    (attempts, failure, index) => {
      if (failure !== 'true' && failure !== 'false') {
        const errors = getErrors(failure);
        attempts.push({
          _s: 'failed' as TestCaseStatus,
          attempt: index,
          startTime: getTestStartTime(time, suiteTimestamp),
          steps: [],
          duration: testCaseTime,
          status: 'failed' as TestRunnerStatus,
          stdout: getStdOut(testCase?.['system-out']),
          stderr: getStdErr(testCase?.['system-err']),
          errors: errors,
          error: errors[0],
        });
      }
      return attempts;
    },
    []
  );
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
  const newStartTime = getTimestampValue(suiteTimestamp) + accTestTime;
  return new Date(newStartTime).toISOString();
}

export function ensureArray<T>(value: unknown): T[] {
  if (!value) {
    return [];
  }
  return Array.isArray(value) ? value : [value] as T[];
}

export function secondsToMilliseconds(seconds: number) {
  return Math.round(seconds * 1000);
}

export function timeToMilliseconds(time: string): number {
  const parsedTime = parseFloat(time);
  if (isNaN(parsedTime)) {
    return 0;
  }
  return secondsToMilliseconds(parsedTime);
}

/**
 * Generates a unique suite name based on the provided suite and allSuites array.
 * The priority for the suite name is as follows:
 * 1. `file` property of the suite.
 * 2. `name` property of the suite.
 * 3. `id` property of the suite.
 * 4. If none of the above properties are available, it returns 'unknown'.
 *
 * If there are duplicates in the `allSuites` array based on the selected property,
 * it appends the `id` or `index` to the suite name to ensure uniqueness.
 *
 * @param suite - The test suite object.
 * @param allSuites - Array of all test suites.
 * @param index - Optional index to include in the suite name for uniqueness.
 * @returns The generated suite name.
 */
export function getSuiteName(
  suite: TestSuite,
  allSuites: TestSuite[],
  index?: number
) {
  const includeIndex = isNumber(index) && index > 0;
  const hasDuplicateId = !!suite.id && hasDuplicate(allSuites, 'id', suite.id);

  if (suite.file) {
    const hasDuplicateFile = hasDuplicate(allSuites, 'file', suite.file);

    if (hasDuplicateFile && !hasDuplicateId) {
      return `${suite.file} - ${suite.id}`;
    }
    if (hasDuplicateFile && includeIndex) {
      return `${suite.file} - ${index}`;
    }
    return suite.file;
  }

  if (suite.name) {
    const hasDuplicateName = hasDuplicate(allSuites, 'name', suite.name);

    if (hasDuplicateName && !hasDuplicateId) {
      return `${suite.name} - ${suite.id}`;
    }
    if (hasDuplicateName && includeIndex) {
      return `${suite.name} - ${index}`;
    }
    return suite.name;
  }

  if (suite.id) {
    if (hasDuplicateId && includeIndex) {
      return `${suite.id} - ${index}`;
    }
    return suite.id;
  }

  if (includeIndex) {
    return `unknown - ${index}`;
  }
  return 'unknown';
}

function hasDuplicate<T>(arr: T[], property: string, value: unknown) {
  const filtered = arr.filter(
    (obj) => (obj as Record<string, unknown>)[property] === value
  );
  return filtered.length > 1;
}
