import { Test, TestCaseResult } from '@jest/reporters';
import type { Circus } from '@jest/types';
import crypto from 'node:crypto';
import {
  ExpectedStatus,
  JestTestCaseStatus,
  TestCaseStatus,
  TestRunnerStatus,
} from '../types';
import { getRelativeFileLocation } from './relativeFileLocation';

export type TestCaseInvocationStart = {
  testCaseStartInfo: Circus.TestCaseStartInfo;
};

export function getDefaultProjectId() {
  return 'root';
}

export function getProjectId(test: Test) {
  return test.context.config.displayName?.name ?? test.context.config.id;
}

export function getTestLocation(testResult: TestCaseResult) {
  return testResult.location;
}

export function getTestCaseFullTitle(
  obj: Circus.TestCaseStartInfo | TestCaseResult
) {
  return [...obj.ancestorTitles, obj.title];
}

export function testToSpecName(test: Test) {
  // return utils.relativePath(test.context.config, test.path);
  return getRelativeFileLocation(test.path, test.context.config.rootDir);
}

export function getTestCaseId(
  test: Test,
  testCaseResult: Circus.TestCaseStartInfo | TestCaseResult
) {
  const title = getTestCaseFullTitle(testCaseResult);
  const specName = testToSpecName(test);

  // Concatenate values
  const combinedString: string = title.join(' ') + specName;
  // + testCaseResult.location?.column ??
  // "" + testCaseResult.location?.line ??
  // "";

  // Hash the combined string using SHA-256
  const fullHash: string = crypto
    .createHash('sha256')
    .update(combinedString)
    .digest('hex');

  // Take the first 16 characters of the hash
  const shortenedHash: string = fullHash.substring(0, 16);

  return shortenedHash;
}

export function getWorker() {
  const workerIndex = +(process.env.JEST_WORKER_ID || 1);

  return {
    workerIndex,
    parallelIndex: workerIndex,
  };
}

export function getTestCaseStatus(
  testStatus: JestTestCaseStatus
): TestCaseStatus {
  switch (testStatus) {
    case 'passed':
      return 'passed';
    case 'failed':
      return 'failed';
    case 'pending':
    case 'todo':
      return 'pending';

    default:
      throw new Error('Invalid Jest test case status');
  }
}

export function getTestRunnerStatus(
  status: JestTestCaseStatus
): TestRunnerStatus {
  switch (status) {
    case 'passed':
      return 'passed';
    case 'failed':
      return 'failed';
    case 'pending':
    case 'todo':
      return 'skipped';

    default:
      throw new Error('Invalid Jest test case status');
  }
}

export function getExpectedStatus(status: JestTestCaseStatus): ExpectedStatus {
  switch (status) {
    case 'pending':
    case 'todo':
      return 'skipped';

    default:
      return 'passed';
  }
}

export function jestStatusFromInvocations(testResults: TestCaseResult[]) {
  const statuses = testResults.map((r) => r.status as JestTestCaseStatus);
  if (statuses.every((status) => status === statuses[0])) {
    return statuses[0];
  }

  return 'failed';
}

export function getAttemptNumber(result: TestCaseResult) {
  return (result?.invocations ?? 1) - 1;
}

// Test that has "passed" and "failed" invocations is `'flaky'`
export function isTestFlaky(testResults: TestCaseResult[]): boolean {
  const statuses = testResults.map((r) => r.status);
  return (
    testResults.length > 1 &&
    statuses.includes('failed') &&
    statuses.includes('passed')
  );
}
