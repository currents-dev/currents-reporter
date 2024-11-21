import {
  ErrorSchema,
  ExpectedStatus,
  Failure,
  InstanceReportTestAttempt,
  TestCase,
  TestCaseStatus,
  TestRunnerStatus,
  TestSuite,
} from './types';
import crypto from 'node:crypto';

export function extractFailure(failure: any) {
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

export function mergeFailuresIntoMessage(failuresArray: string[]) {
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

export function getTestCase(
  testCase: TestCase,
  suite: TestSuite,
  accumulatedTestTime: number
) {
  const failures = assertForArray(testCase.failure);
  const hasFailure = failures?.length ?? 0 > 0;

  return {
    _t: getTimestampValue(suite?.timestamp ?? ''),
    testId: generateTestId(
      getTestTitle(testCase.name, suite.name).join(', '),
      getSpec(suite)
    ),
    title: getTestTitle(testCase.name, suite.name),
    state: (hasFailure ? 'failed' : 'passed') as TestCaseStatus,
    isFlaky: getTestFlakiness(),
    expectedStatus: (hasFailure ? 'skipped' : 'passed') as ExpectedStatus,
    timeout: getTimeout(),
    location: getTestCaseLocation(suite?.file ?? ''),
    retries: getTestRetries(failures ?? []),
    attempts: getTestAttempts(
      testCase,
      failures ?? [],
      suite.timestamp ?? '',
      accumulatedTestTime
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

export function getTestTitle(testName?: string, suiteName?: string) {
  const title = [];
  if (suiteName) {
    title.push(suiteName);
  }
  if (testName) {
    title.push(testName);
  }
  return title;
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
  accumulatedTime: number
) {
  const testCaseTime = parseFloat(testCase?.time ?? '0') * 1000;
  if (failures.length === 0) {
    return [
      {
        _s: 'passed' as TestCaseStatus,
        attempt: 1,
        workerIndex: 1,
        parallelIndex: 1,
        startTime: suiteTimestamp,
        steps: [],
        duration: testCaseTime,
        status: 'passed' as TestRunnerStatus,
        stdout: getStdOut(testCase?.['system-out']),
        stderr: undefined,
        errors: undefined,
        error: undefined,
      },
    ];
  }

  const attempts: InstanceReportTestAttempt[] = [];
  let attemptCounter = 1;
  failures.forEach((item) => {
    // There can be failure properties in testcase tag, with string value of true|false, so avoid
    if (item !== 'true' && item !== 'false') {
      const errors = getErrors(item);
      attempts.push({
        _s: 'failed' as TestCaseStatus,
        attempt: attemptCounter,
        workerIndex: 1,
        parallelIndex: 1,
        startTime: getTestStartTime(accumulatedTime, suiteTimestamp),
        steps: [],
        duration: testCaseTime,
        status: 'passed' as TestRunnerStatus,
        stdout: getStdOut(testCase?.['system-out']),
        stderr: getStdErr(testCase?.['system-err']),
        errors: errors,
        error: errors ? errors[0] : undefined,
      });
      attemptCounter++;
    }
  });
  return attempts;
}

function getStdOut(systemOut?: string) {
  return systemOut ? [systemOut] : undefined;
}

function getStdErr(systemErr?: string) {
  return systemErr ? [systemErr] : undefined;
}

function getErrors(failure: Failure | string) {
  const errors: ErrorSchema[] = [];
  if (failure !== 'true' && failure !== 'false') {
    if (typeof failure === 'string') {
      errors.push({
        message: failure,
      });
    } else {
      errors.push({
        message: failure.message,
        stack: failure._,
        value: failure.type,
      });
    }
  }
  if (errors.length === 0) {
    return undefined;
  }
  return errors;
}

function getTestStartTime(accumulatedTestTime: number, suiteTimestamp: string) {
  // This is the most accurate as the failure tag does not have time nor
  const newStartTime = new Date(suiteTimestamp).getTime() + accumulatedTestTime;
  return new Date(newStartTime).toISOString();
}

export function getSpec(suite: TestSuite) {
  return suite.file ?? suite.name ?? 'No spec';
}

export function assertForArray(element: unknown) {
  if (!element) {
    return [];
  }
  return Array.isArray(element) ? element : [element];
}
