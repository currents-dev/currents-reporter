import fs from 'fs-extra';
import os from 'os';
import { join } from 'path';
import type { AggregatedResult, Config, Test, TestResult } from '@jest/reporters';
import type { Circus } from '@jest/types';
import CustomReporter from './reporter';
import type { InstanceReport } from './types';

describe('CustomReporter artifacts', () => {
  it('creates artifacts from console logs via properties', async () => {
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
        message: `currents.artifact.attempt.0.0.path=${attachmentPath}`,
        origin: `${testFilePath}:10:1)`,
        type: 'log',
      },
      {
        message: `currents.artifact.attempt.0.0.type=screenshot`,
        origin: `${testFilePath}:10:1)`,
        type: 'log',
      },
      {
        message: `currents.artifact.attempt.0.0.contentType=image/bmp`,
        origin: `${testFilePath}:10:1)`,
        type: 'log',
      },
      {
        message: `currents.artifact.test.0.path=${attachmentPath}`,
        origin: `${testFilePath}:10:1)`,
        type: 'log',
      },
      {
        message: `currents.artifact.test.0.type=attachment`,
        origin: `${testFilePath}:10:1)`,
        type: 'log',
      },
      {
        message: `currents.artifact.test.0.contentType=image/bmp`,
        origin: `${testFilePath}:10:1)`,
        type: 'log',
      },
      {
        message: 'stdout message',
        origin: `${testFilePath}:10:1)`,
        type: 'log',
      },
      {
        message: 'stderr message',
        origin: `${testFilePath}:10:1)`,
        type: 'error',
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

    // Check attempt artifacts
    expect(attempt.artifacts).toBeDefined();
    expect(attempt.artifacts?.length).toBe(1);
    
    const screenshotArtifact = attempt.artifacts?.find(
      (a) => a.type === 'screenshot'
    );
    expect(screenshotArtifact).toBeDefined();
    expect(screenshotArtifact?.contentType).toBe('image/bmp');
    if (screenshotArtifact) {
      const p = join(baseDir, screenshotArtifact.path);
      expect(await fs.pathExists(p)).toBe(true);
    }

    // Check test level artifacts (surfaced to test object)
    expect(testEntry.artifacts).toBeDefined();
    expect(testEntry.artifacts?.length).toBe(1);
    
    const attachmentArtifact = testEntry.artifacts?.find(
      (a) => a.type === 'attachment'
    );
    expect(attachmentArtifact).toBeDefined();
    expect(attachmentArtifact?.contentType).toBe('image/bmp');
    if (attachmentArtifact) {
      const p = join(baseDir, attachmentArtifact.path);
      expect(await fs.pathExists(p)).toBe(true);
    }

    const writtenArtifacts = await fs.readdir(artifactsDir);
    // 1 attempt artifact + 1 test artifact = 2
    expect(writtenArtifacts.length).toBe(2);
  });
});

