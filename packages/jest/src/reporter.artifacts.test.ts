import fs from 'fs-extra';
import os from 'os';
import { join } from 'path';
import type { AggregatedResult, Config, Test, TestResult } from '@jest/reporters';
import type { Circus } from '@jest/types';
import CustomReporter from './reporter';
import type { InstanceReport } from './types';

describe('CustomReporter artifacts', () => {
  it('creates stdout and attachment artifacts from console logs', async () => {
    const baseDir = await fs.mkdtemp(
      join(os.tmpdir(), 'currents-jest-artifacts-')
    );

    const testFilePath = join(baseDir, 'sample.test.ts');
    await fs.writeFile(testFilePath, "test('name', () => {});", 'utf8');

    const attachmentPath = join(baseDir, 'image.bmp');
    await fs.writeFile(attachmentPath, 'dummy', 'utf8');

    const globalConfig: Config.GlobalConfig = {
      rootDir: baseDir,
    } as Config.GlobalConfig;

    const reporter = new CustomReporter(globalConfig, { reportDir: baseDir });

    const aggregatedResults: AggregatedResult = {
      numTotalTestSuites: 1,
    } as AggregatedResult;

    await reporter.onRunStart(aggregatedResults, {
      estimatedTime: 0,
      showStatus: false,
    });

    const test: Test = {
      context: {
        config: {
          rootDir: baseDir,
          id: 'project-1',
        },
      },
      path: testFilePath,
    } as unknown as Test;

    await reporter.onTestStart(test);

    const testCaseStartInfo: Circus.TestCaseStartInfo = {
      title: 'attaches artifacts',
      ancestorTitles: ['suite'],
      startedAt: Date.now(),
    } as Circus.TestCaseStartInfo;

    await reporter.onTestCaseStart(test, testCaseStartInfo);

    const testCaseResult = {
      title: 'attaches artifacts',
      ancestorTitles: ['suite'],
      status: 'passed',
      duration: 5,
      location: { line: 10, column: 1 },
      failureMessages: [],
      invocations: 1,
    } as any;

    await reporter.onTestCaseResult(test, testCaseResult);

    const consoleEntries = [
      {
        message: `[[ATTACHMENT|${attachmentPath}]]`,
        origin: `${testFilePath}:10:1)`,
        type: 'log',
      },
      {
        message: 'stdout message',
        origin: `${testFilePath}:10:1)`,
        type: 'log',
      },
    ];

    const testResult: TestResult = {
      testFilePath,
      testResults: [testCaseResult],
      numPassingTests: 1,
      numPendingTests: 0,
      numTodoTests: 0,
      numFailingTests: 0,
      perfStats: {
        start: Date.now(),
        end: Date.now() + 10,
        runtime: 0,
        slow: false,
      },
      console: consoleEntries as any,
    } as any;

    await reporter.onTestFileResult(test, testResult);

    const instancesDir = join(baseDir, 'instances');
    const artifactsDir = join(baseDir, 'artifacts');

    const instanceFiles = await fs.readdir(instancesDir);
    expect(instanceFiles.length).toBe(1);

    const instanceJsonPath = join(instancesDir, instanceFiles[0]);
    const content = await fs.readFile(instanceJsonPath, 'utf8');
    const parsed = JSON.parse(content) as InstanceReport;

    const testEntry = parsed.results.tests[0];
    const attempt = testEntry.attempts[0];

    expect(attempt.artifacts).toBeDefined();

    const stdoutArtifact = attempt.artifacts?.find(
      (a) => a.type === 'stdout'
    );
    const attachmentArtifact = attempt.artifacts?.find(
      (a) => a.type === 'screenshot'
    );

    expect(stdoutArtifact).toBeDefined();
    expect(attachmentArtifact).toBeDefined();

    if (stdoutArtifact) {
      const p = join(baseDir, stdoutArtifact.path);
      expect(await fs.pathExists(p)).toBe(true);
    }

    if (attachmentArtifact) {
      const p = join(baseDir, attachmentArtifact.path);
      expect(await fs.pathExists(p)).toBe(true);
    }

    const writtenArtifacts = await fs.readdir(artifactsDir);
    expect(writtenArtifacts.length).toBeGreaterThanOrEqual(2);
  });
});

