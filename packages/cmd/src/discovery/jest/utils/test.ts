import { Test, TestCaseResult } from "@jest/reporters";
import type { Circus } from "@jest/types";
import crypto from "node:crypto";
import { getRelativeFileLocation } from "./fs";

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

export function getTestTags(testTitle: string[]) {
  const titleTags = (testTitle.join(" ").match(/@(\S+)/g) ?? [])
    .filter(Boolean)
    .map((t) => t as string);

  return Array.from(
    new Set([...titleTags].map((i) => i.trim()).map((i) => i.replace("@", "")))
  );
}

export function getTestCaseWorker() {
  const workerIndex = +(process.env.JEST_WORKER_ID || 1);

  return {
    workerIndex,
    parallelIndex: workerIndex,
  };
}
