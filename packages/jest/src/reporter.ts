import type {
  AggregatedResult,
  Config,
  Reporter,
  ReporterOnStartOptions,
  Test,
  TestCaseResult,
  TestContext,
  TestResult,
} from "@jest/reporters";
import { Circus } from "@jest/types";

import { join } from "path";
import {
  Deferred,
  createFolder,
  createUniqueFolder,
  debug,
  formatError,
  generateShortHash,
  getAttemptNumber,
  getTestCaseStatus,
  getError,
  getProjectId,
  getTestCaseFullTitle,
  getTestCaseId,
  getWorker,
  isTestFlaky,
  jestStatusFromInvocations,
  testToSpecName,
  writeFileAsync,
  getExpectedStatus,
  getTestRunnerStatus,
} from "./lib";
import { getReportConfig } from "./lib/getReportConfig";
import { info } from "./logger";
import { InstanceReport, JestTestCaseStatus, WorkerInfo } from "./types";

type TestCase = {
  id: string;
  timestamps: number[];
  title: string[];
  result: TestCaseResult[];
  worker: WorkerInfo;
  config: Test["context"]["config"];
  location?: {
    column?: number;
    line?: number;
  } | null;
};

type SpecInfo = {
  projectId: string;
  specName: string;
  testCaseList: Record<string, TestCase>;
  specResult: TestResult | null;
  worker: WorkerInfo;
};

type ReporterOptions = {
  reportDir?: string;
};

export default class CustomReporter implements Reporter {
  private rootDir: string;
  private reportDir: string = "";
  private instancesDir: string = "";
  private specInfo: Record<string, SpecInfo> = {};
  private projectBySpecMap: Record<string, string> = {};
  private specsCount = 0;
  private processedSpecsCount = 0;

  // Deferred promises for various operations
  private reportDirDeferred = new Deferred<void>();
  private specInfoDeferred: { [key: string]: Deferred<void> } = {};
  private testCaseDeferred: { [key: string]: Deferred<void> } = {};
  private resultsDeferred: { [key: string]: Deferred<void> } = {};

  constructor(
    private readonly globalConfig: Config.GlobalConfig,
    private readonly options?: ReporterOptions
  ) {
    this.rootDir = this.globalConfig.rootDir;
  }

  async onRunStart(
    aggregatedResults: AggregatedResult,
    options: ReporterOnStartOptions
  ): Promise<void> {
    debug("Run started");

    this.specsCount = aggregatedResults.numTotalTestSuites;

    this.reportDir = this.options?.reportDir
      ? await createFolder(this.options?.reportDir)
      : await createUniqueFolder(this.rootDir, ".currents-report");

    info("[currents]: Run started");
    info("[currents]: Report directory is set to - %s", this.reportDir);

    this.instancesDir = await createFolder(join(this.reportDir, "instances"));

    const reportConfig = getReportConfig(this.globalConfig);
    debug("Report config:", reportConfig);

    await writeFileAsync(
      this.reportDir,
      "config.json",
      JSON.stringify(reportConfig)
    );

    this.reportDirDeferred.resolve();
  }

  async onTestFileStart(test: Test): Promise<void> {
    const specName = testToSpecName(test);
    const projectId = getProjectId(test);

    this.projectBySpecMap[specName] = projectId;
    await this.reportDirDeferred.promise;

    const specKey = getSpecKey(projectId, specName);
    this.specInfo[specKey] = {
      projectId,
      specName,
      testCaseList: {},
      specResult: null,
      worker: getWorker(),
    };

    this.specInfoDeferred[specKey] = new Deferred<void>();
    this.specInfoDeferred[specKey].resolve();
    debug("Spec execution started [%s]: %o", specName, this.specInfo[specKey]);
  }

  /**
   * Called before running a spec (prior to `before` hooks)
   * Not called for `skipped` and `todo` specs
   */
  async onTestCaseStart(
    test: Test,
    testCaseStartInfo: Circus.TestCaseStartInfo
  ): Promise<void> {
    const specName = testToSpecName(test);
    const projectId = this.projectBySpecMap[specName];
    const testId = getTestCaseId(test, testCaseStartInfo);
    const specKey = getSpecKey(projectId, specName);

    // onTestCaseStart before onTestFileStart
    if (!this.specInfo[specKey]) {
      this.specInfo[specKey] = {
        projectId,
        specName,
        testCaseList: {},
        specResult: null,
        worker: getWorker(),
      };

      this.specInfoDeferred[specKey] = new Deferred<void>();
      this.specInfoDeferred[specKey].resolve();
    }

    const testCaseKey = getTestCaseKey(projectId, specName, testId);

    if (!this.specInfo[specKey].testCaseList[testCaseKey]) {
      this.specInfo[specKey].testCaseList[testCaseKey] = {
        id: testId,
        timestamps: [testCaseStartInfo.startedAt ?? new Date().getTime()],
        title: getTestCaseFullTitle(testCaseStartInfo),
        result: [],
        worker: getWorker(),
        config: test.context.config,
      };

      this.testCaseDeferred[testCaseKey] = new Deferred<void>();
      this.testCaseDeferred[testCaseKey].resolve();
    } else {
      this.specInfo[specKey].testCaseList[testCaseKey].timestamps.push(
        testCaseStartInfo.startedAt ?? new Date().getTime()
      );
    }

    debug(
      "Test case execution started [%s]: %o",
      testId,
      this.specInfo[specKey].testCaseList[testCaseKey]
    );
  }

  async onTestCaseResult(
    test: Test,
    testCaseResult: TestCaseResult
  ): Promise<void> {
    const specName = testToSpecName(test);
    const projectId = this.projectBySpecMap[specName];
    const testId = getTestCaseId(test, testCaseResult);

    const specKey = getSpecKey(projectId, specName);
    await this.specInfoDeferred[specKey].promise;

    const testCaseKey = getTestCaseKey(projectId, specName, testId);

    // if onTestCaseStart was not called
    if (!this.testCaseDeferred[testCaseKey]) {
      this.testCaseDeferred[testCaseKey] = new Deferred<void>();
      this.testCaseDeferred[testCaseKey].resolve();
    }

    await this.testCaseDeferred[testCaseKey].promise;

    if (!this.specInfo[specKey].testCaseList[testCaseKey]) {
      this.specInfo[specKey].testCaseList[testCaseKey] = {
        id: testId,
        timestamps: [],
        title: getTestCaseFullTitle(testCaseResult),
        result: [],
        worker: getWorker(),
        config: test.context.config,
        location: testCaseResult.location,
      };
      debug(
        "Test case execution was skipped [%s]: %o",
        testId,
        this.specInfo[specKey].testCaseList[testCaseKey]
      );
    }

    this.specInfo[specKey].testCaseList[testCaseKey].result.push(
      testCaseResult
    );

    this.resultsDeferred[testCaseKey] = new Deferred<void>();
    this.resultsDeferred[testCaseKey].resolve();
    debug(
      "Test case execution completed [%s]: %o",
      testId,
      this.specInfo[specKey].testCaseList[testCaseKey]
    );
  }

  async onTestFileResult(test: Test, testResult: TestResult): Promise<void> {
    const specName = testToSpecName(test);
    const projectId = this.projectBySpecMap[specName];
    const specKey = getSpecKey(projectId, specName);

    debug(
      "Spec execution completed [%s], jest test result: %o",
      specName,
      testResult
    );

    testResult.testResults.forEach(async (testCaseResult) => {
      const testId = getTestCaseId(test, testCaseResult);
      const testCaseKey = getTestCaseKey(projectId, specName, testId);
      if (!this.specInfo[specKey].testCaseList[testCaseKey]) {
        this.specInfo[specKey].testCaseList[testCaseKey] = {
          id: testId,
          timestamps: [],
          title: getTestCaseFullTitle(testCaseResult),
          result: [testCaseResult],
          worker: getWorker(),
          config: test.context.config,
          location: testCaseResult.location,
        };

        this.resultsDeferred[testCaseKey] = new Deferred<void>();
        this.resultsDeferred[testCaseKey].resolve();

        debug(
          "Spec execution completed [%s][%s], adding skipped tests: %o",
          specName,
          testId,
          this.specInfo[specKey].testCaseList[testCaseKey]
        );
      }
    });

    const startTime = new Date(testResult.perfStats.start).toISOString();
    const endTime = new Date(testResult.perfStats.end).toISOString();
    const wallClockDuration =
      testResult.perfStats.end - testResult.perfStats.start;

    const tests = await Promise.all(
      Object.values(this.specInfo[specKey].testCaseList).map(
        async (testCase) => {
          const testCaseKey = getTestCaseKey(projectId, specName, testCase.id);
          await this.resultsDeferred[testCaseKey].promise;

          const jestStatus = jestStatusFromInvocations(testCase.result);

          return {
            _t: testCase.timestamps[0] ?? testResult.perfStats.start,
            testId: testCase.id,
            title: testCase.title,
            state: getTestCaseStatus(jestStatus),
            isFlaky: isTestFlaky(testCase.result),
            expectedStatus: getExpectedStatus(jestStatus),
            timeout: 0,
            location: {
              column: testCase.location?.column ?? 1,
              file: specName,
              line: testCase.location?.line ?? 1,
            },
            retries: testCase.result.length + 1,
            attempts: testCase.result.map((result, index) => {
              const errors = (result.failureMessages ?? []).map((i) =>
                getError(
                  formatError(
                    testCase.config.rootDir,
                    new Error(i),
                    false,
                    specName
                  ),
                  testCase.config.rootDir
                )
              );

              return {
                _s: getTestCaseStatus(result.status as JestTestCaseStatus),
                attempt: getAttemptNumber(result),

                workerIndex: testCase.worker.workerIndex,
                parallelIndex: testCase.worker.parallelIndex,

                startTime:
                  testCase.timestamps.length && testCase.timestamps[index]
                    ? new Date(testCase.timestamps[index]).toISOString()
                    : startTime,
                steps: [],

                duration: testCase.result[index].duration ?? 0,
                status: getTestRunnerStatus(
                  result.status as JestTestCaseStatus
                ),

                stdout: [],
                stderr: result.failureMessages ?? [],

                errors,
                error: errors[0],
              };
            }),
          };
        }
      )
    );

    const flakyCount = tests.filter((t) => t.isFlaky).length;

    const result: InstanceReport = {
      groupId: this.specInfo[specKey].projectId,
      spec: this.specInfo[specKey].specName,
      worker: this.specInfo[specKey].worker,
      startTime,
      results: {
        stats: {
          suites: 1,
          tests: testResult.testResults.length,
          passes: testResult.numPassingTests,
          pending: 0,
          skipped: testResult.numPendingTests + testResult.numTodoTests,
          failures: testResult.numFailingTests,
          flaky: flakyCount,
          wallClockStartedAt: startTime,
          wallClockEndedAt: endTime,
          wallClockDuration,
        },
        tests,
      },
    };

    debug(
      "Spec execution completed [%s], result payload: %o",
      specName,
      result
    );

    const specReportPath = await writeFileAsync(
      this.instancesDir,
      `${generateShortHash(this.specInfo[specKey].specName)}.json`,
      JSON.stringify(result)
    );
    this.processedSpecsCount += 1;
    info(
      "[currents]: [%s] - spec results written to file: %s [%d/%d]",
      specName,
      specReportPath,
      this.processedSpecsCount,
      this.specsCount
    );
  }

  async onRunComplete(test: Set<TestContext>, fullResult: AggregatedResult) {
    info("[currents]: Run completed");
  }
}

function getSpecKey(projectId: string, specName: string) {
  return `${projectId}:${specName}`;
}

function getTestCaseKey(projectId: string, specName: string, testId: string) {
  return `${projectId}:${specName}:${testId}`;
}
