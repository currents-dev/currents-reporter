import { Test, TestCaseResult } from "@jest/reporters";
import type { Circus } from "@jest/types";
import { last } from "lodash";
import crypto from "node:crypto";
import { getRelativeFileLocation } from "./fs";

export type TestCase = {
  id: string;
  test: Test;
  invocations: TestCaseInvocation[];
};

export type TestCaseStartInfo = Circus.TestCaseStartInfo;

export type TestCaseInvocationStart = {
  testCaseStartInfo: Circus.TestCaseStartInfo;
};

export type TestCaseInvocationResult = {
  result: TestCaseResult;
};

export type TestCaseInvocation = TestCaseInvocationStart &
  Partial<TestCaseInvocationResult>;

export function getDefaultProjectId() {
  return "root";
}

export function getProjectId(test: Test) {
  return test.context.config.displayName?.name ?? test.context.config.id;
}

export function getTestLocation(testResult: TestCaseResult) {
  return testResult.location;
}

export function getTestCaseFullTitle(obj: TestCaseStartInfo | TestCaseResult) {
  return [...obj.ancestorTitles, obj.title];
}

export function testToSpecName(test: Test) {
  // return utils.relativePath(test.context.config, test.path);
  return getRelativeFileLocation(test.path, test.context.config.rootDir);
}

export function getTestCaseId(
  test: Test,
  testCaseResult: TestCaseStartInfo | TestCaseResult
) {
  const title = getTestCaseFullTitle(testCaseResult);
  const specName = testToSpecName(test);

  // Concatenate values
  const combinedString: string = title.join(" ") + specName;
  // + testCaseResult.location?.column ??
  // "" + testCaseResult.location?.line ??
  // "";

  // Hash the combined string using SHA-256
  const fullHash: string = crypto
    .createHash("sha256")
    .update(combinedString)
    .digest("hex");

  // Take the first 16 characters of the hash
  const shortenedHash: string = fullHash.substring(0, 16);

  return shortenedHash;
}

export function getTestTags(test: Test, testCaseResult: TestCaseResult) {
  return [] as string[];
}

export function getTestCaseLabel(testCase: TestCase): string {
  return getTestCaseFullTitle(testCase.invocations[0].testCaseStartInfo)
    .filter((i) => !!i)
    .join(" > ");
}

export function getTestCaseWorker(invocation: TestCaseInvocation) {
  const workerIndex = ["skip", "todo"].includes(
    invocation.testCaseStartInfo.mode as string
  )
    ? -1
    : +(process.env.JEST_WORKER_ID || 1);

  return {
    workerIndex,
    parallelIndex: workerIndex,
  };
}

export function getAttemptId(testCase: TestCase) {
  const lastInvocation = last(testCase.invocations)!;
  const testId = getTestCaseId(testCase.test, lastInvocation.testCaseStartInfo);
  return lastInvocation.result ? `${testId}-${lastInvocation.result}` : testId;
}

