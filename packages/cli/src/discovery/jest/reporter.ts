import {
  AggregatedResult,
  Reporter,
  Test,
  TestContext,
  TestResult,
} from "@jest/reporters";
import fs from "fs-extra";
import {
  getDefaultProjectId,
  getProjectId,
  getTestCaseFullTitle,
  getTestCaseId,
  testToSpecName,
} from "./utils/test";

import { dim } from "../../logger";
import { FullSuiteProject, FullSuiteTest } from "../types";

export default class DiscoveryReporter implements Reporter {
  private fullTestSuite: Record<
    string,
    Omit<FullSuiteProject, "tests"> & {
      tests: FullSuiteTest[];
    }
  > = {};

  onRunStart() {
    console.time(dim("@currents/jest-discovery"));
  }

  onTestFileResult(
    test: Test,
    testResult: TestResult,
    aggregatedResult: AggregatedResult
  ): Promise<void> | void {
    const projectId = getProjectId(test);

    if (!this.fullTestSuite[projectId]) {
      this.fullTestSuite[projectId] = {
        name: projectId,
        tags: [],
        tests: [],
      };
    }

    const spec = testToSpecName(test);
    this.fullTestSuite[projectId].tests.push(
      ...testResult.testResults.map((tc) => ({
        spec,
        tags: [],
        testId: getTestCaseId(test, tc),
        title: getTestCaseFullTitle(tc),
      }))
    );
  }

  async onRunComplete(testContexts: Set<TestContext>): Promise<void> {
    // eslint-disable-next-line turbo/no-undeclared-env-vars
    const filePath = process.env.CURRENTS_DISCOVERY_PATH;
    if (!filePath) {
      throw new Error("CURRENTS_DISCOVERY_PATH is not set");
    }
    const fullTestSuite = this.getFullTestSuite(testContexts);

    await fs.writeFile(filePath, JSON.stringify(fullTestSuite), "utf8");

    console.timeEnd(dim("@currents/jest-discovery"));
  }

  // this is required to prevent different projectId in the full test suite and reported results
  private getFullTestSuite(testContexts: Set<TestContext>) {
    const fullTestSuite = Object.values(this.fullTestSuite);

    const oneProject = fullTestSuite.length === 1;
    const projectNameIsGeneratedId =
      fullTestSuite.length > 0 &&
      testContexts.size > 0 &&
      [...testContexts][0].config.id === fullTestSuite[0].name;

    if (oneProject && projectNameIsGeneratedId) {
      fullTestSuite[0].name = getDefaultProjectId();
    }

    return fullTestSuite;
  }
}
