import { Test, TestCaseResult } from "@jest/reporters";
import type { Circus } from "@jest/types";
import { flowRight } from "lodash";
import crypto from "node:crypto";
import { P, match } from "ts-pattern";
import { TestExpectedStatus, TestState } from "../types";
import { getRelativeFileLocation } from "./relativeFileLocation";

export type TestCaseInvocationStart = {
  testCaseStartInfo: Circus.TestCaseStartInfo;
};

export function getDefaultProjectId() {
  return "root";
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

export function getWorker() {
  const workerIndex = +(process.env.JEST_WORKER_ID || 1);

  return {
    workerIndex,
    parallelIndex: workerIndex,
  };
}

export function statusToCurrentsStatus(
  testStatus: TestCaseResult["status"]
): TestState {
  switch (testStatus) {
    case "passed":
      return TestState.Passed;
    case "failed":
      return TestState.Failed;
    case "skipped":
    case "todo":
    case "pending":
    case "disabled":
      return TestState.Pending;

    // case "focused":

    default:
      return TestState.Failed;
  }
}

export function getRawTestStatus(
  testCaseResults: TestCaseResult[]
): TestExpectedStatus {
  const allStatuses = testCaseResults.map((i) => i.status);

  // if all the attempts have similar status
  if (allStatuses.every((status) => status === allStatuses[0])) {
    return match(allStatuses[0])
      .with(
        P.union("disabled", "skipped", "todo", "pending"),
        () => TestExpectedStatus.Skipped
      )
      .with("passed", () => TestExpectedStatus.Passed)
      .with("failed", () => TestExpectedStatus.Failed)
      .otherwise(() => TestExpectedStatus.Failed);
  }

  // otherwise, it is a mix of passed and failed attempts, so it is flaky
  // and it doesn't pass the expected status
  return TestExpectedStatus.Failed;
}

export const getTestCaseStatus = flowRight(
  statusToCurrentsStatus,
  getRawTestStatus
);

export function getAttemptNumber(result: TestCaseResult) {
  return result?.invocations ?? 1;
}
