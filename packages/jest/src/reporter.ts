import type {
  AggregatedResult,
  Config,
  Reporter,
  ReporterOnStartOptions,
  Test,
  TestCaseResult,
  TestContext,
  TestResult,
} from '@jest/reporters';
import { Circus } from '@jest/types';

import { join } from 'path';
import {
  DetoxManifestTest,
  DetoxSession,
  Deferred,
  createFolder,
  createUniqueFolder,
  debug,
  formatError,
  generateShortHash,
  getAttemptNumber,
  getError,
  getExpectedStatus,
  getProjectId,
  getTestCaseFullTitle,
  getTestCaseId,
  getTestCaseStatus,
  FullTestSuite,
  getDetoxSession,
  getTestRunnerStatus,
  isTestFlaky,
  jestStatusFromInvocations,
  getTestTags,
  isPartialRun,
  mergeInstanceReport,
  readInstanceReport,
  testToSpecName,
  withDefaultProjectName,
  writeDetoxManifest,
  writeFileAsync,
  writeFullTestSuite,
} from './lib';
import { getReportConfig } from './lib/getReportConfig';
import { info } from './logger';
import { InstanceReport, JestTestCaseStatus } from './types';

type TestCase = {
  id: string;
  timestamps: number[];
  title: string[];
  result: TestCaseResult[];
  config: Test['context']['config'];
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
};

type ReporterOptions = {
  reportDir?: string;
};

export default class CustomReporter implements Reporter {
  private rootDir: string;
  private reportDir: string = '';
  private instancesDir: string = '';
  private specInfo: Record<string, SpecInfo> = {};
  private projectBySpecMap: Record<string, string> = {};
  private specsCount = 0;
  private processedSpecsCount = 0;
  private detoxSession?: DetoxSession;
  private detoxTests: DetoxManifestTest[] = [];

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
    debug('Run started');

    this.specsCount = aggregatedResults.numTotalTestSuites;

    const envReportDir = process.env.CURRENTS_REPORT_DIR?.trim();
    const reportDirOption = envReportDir || this.options?.reportDir;
    this.reportDir = reportDirOption
      ? await createFolder(reportDirOption)
      : await createUniqueFolder(this.rootDir, '.currents');

    info('[currents]: Run started');
    info('[currents]: Report directory is set to - %s', this.reportDir);

    this.instancesDir = await createFolder(join(this.reportDir, 'instances'));

    this.detoxSession = await getDetoxSession();

    const reportConfig = getReportConfig(this.globalConfig, this.detoxSession);
    debug('Report config:', reportConfig);

    await writeFileAsync(
      this.reportDir,
      'config.json',
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
    };

    this.specInfoDeferred[specKey] = new Deferred<void>();
    this.specInfoDeferred[specKey].resolve();
    debug('Spec execution started [%s]: %o', specName, this.specInfo[specKey]);
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
      'Test case execution started [%s]: %o',
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
        config: test.context.config,
        location: testCaseResult.location,
      };
      debug(
        'Test case execution was skipped [%s]: %o',
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
      'Test case execution completed [%s]: %o',
      testId,
      this.specInfo[specKey].testCaseList[testCaseKey]
    );
  }

  async onTestFileResult(test: Test, testResult: TestResult): Promise<void> {
    const specName = testToSpecName(test);
    const projectId = this.projectBySpecMap[specName];
    const specKey = getSpecKey(projectId, specName);

    debug(
      'Spec execution completed [%s], jest test result: %o',
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
          config: test.context.config,
          location: testCaseResult.location,
        };

        this.resultsDeferred[testCaseKey] = new Deferred<void>();
        this.resultsDeferred[testCaseKey].resolve();

        debug(
          'Spec execution completed [%s][%s], adding skipped tests: %o',
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

          if (this.detoxSession) {
            this.detoxTests.push(
              getDetoxManifestTest(testCase, this.detoxSession)
            );
          }

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
            retries: testCase.result.length,
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
      'Spec execution completed [%s], result payload: %o',
      specName,
      result
    );

    const instanceFileName = `${generateShortHash(
      this.specInfo[specKey].specName
    )}.json`;

    await writeFileAsync(
      this.instancesDir,
      instanceFileName,
      JSON.stringify(await this.withPreviousAttempts(instanceFileName, result))
    );
    this.processedSpecsCount += 1;
    // info(
    //   "[currents]: [%s] - spec results written to file: %s [%d/%d]",
    //   specName,
    //   specReportPath,
    //   this.processedSpecsCount,
    //   this.specsCount
    // );
  }

  async onRunComplete(test: Set<TestContext>, fullResult: AggregatedResult) {
    if (this.detoxSession) {
      // Without this file `currents upload` lists the tests with a second Jest
      // run, which for Detox boots a device and installs the app again.
      if (isPartialRun(this.globalConfig)) {
        debug('Partial run - not writing the full test suite');
      } else {
        await writeFullTestSuite(this.reportDir, this.getFullTestSuite());
      }

      await writeDetoxManifest(
        this.reportDir,
        this.detoxSession,
        this.detoxTests
      );
    }

    info('[currents]: Run completed');
  }

  /**
   * Only a Detox rerun writes a spec a previous Jest process already reported;
   * a first run overwrites whatever an earlier, unrelated run left behind.
   */
  private async withPreviousAttempts(
    instanceFileName: string,
    result: InstanceReport
  ): Promise<InstanceReport> {
    if (!this.detoxSession?.testSessionIndex) {
      return result;
    }

    const previous = await readInstanceReport<InstanceReport>(
      join(this.instancesDir, instanceFileName)
    );

    if (!previous) {
      return result;
    }

    debug('Merging the results of Detox rerun %d', {
      session: this.detoxSession.testSessionIndex,
    });

    return mergeInstanceReport(previous, result);
  }

  private getFullTestSuite(): FullTestSuite {
    const projects: Record<string, FullTestSuite[number]> = {};
    const configIds = new Set<string>();

    Object.values(this.specInfo).forEach(
      ({ projectId, specName, testCaseList }) => {
        projects[projectId] = projects[projectId] ?? {
          name: projectId,
          tags: [],
          tests: [],
        };

        Object.values(testCaseList).forEach((testCase) => {
          configIds.add(testCase.config.id);
          projects[projectId].tests.push({
            spec: specName,
            testId: testCase.id,
            title: testCase.title,
            tags: getTestTags(testCase.title),
          });
        });
      }
    );

    return withDefaultProjectName(Object.values(projects), [...configIds]);
  }
}

function getSpecKey(projectId: string, specName: string) {
  return `${projectId}:${specName}`;
}

function getTestCaseKey(projectId: string, specName: string, testId: string) {
  return `${projectId}:${specName}:${testId}`;
}

/**
 * Detox names an artifact directory after the test's full name, its status and
 * its invocation count, so those are recorded per attempt for `currents upload`
 * to resolve the directories once Detox has closed the files.
 */
function getDetoxManifestTest(
  testCase: TestCase,
  session: DetoxSession
): DetoxManifestTest {
  return {
    testId: testCase.id,
    fullName: testCase.result[0]?.fullName ?? testCase.title.join(' '),
    attempts: testCase.result.map((result) => ({
      attempt: getAttemptNumber(result),
      session: session.testSessionIndex,
      invocations: result.invocations ?? 1,
      status: result.status,
    })),
  };
}
