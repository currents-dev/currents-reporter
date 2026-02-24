import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs-extra';
import os from 'os';
import { join } from 'path';
import { handleConvert } from '../index';
import { setConvertCommandConfig } from '../../../config/convert';
import type { InstanceReport } from '../../../types';

let mockedInstanceMap: Map<string, InstanceReport>;

vi.mock('../getParsedXMLArray', () => ({
  getParsedXMLArray: vi.fn(async () => [{ dummy: true }]),
}));

vi.mock('../createFullTestSuite', () => ({
  createFullTestSuite: vi.fn(() => ({})),
}));

vi.mock('../getReportConfig', () => ({
  getReportConfig: vi.fn(() => ({ projectId: 'p', groupId: 'g' })),
}));

vi.mock('../getInstanceMap', () => ({
  getInstanceMap: vi.fn(async () => mockedInstanceMap),
}));

describe('handleConvert artifacts', () => {
  const tmpDirs: string[] = [];

  afterEach(async () => {
    for (const dir of tmpDirs.splice(0, tmpDirs.length)) {
      await fs.remove(dir);
    }
  });

  it('creates stdout and attachment artifacts from attempts logs', async () => {
    const baseDir = await fs.mkdtemp(
      join(os.tmpdir(), 'currents-convert-artifacts-')
    );
    tmpDirs.push(baseDir);

    const artifactsSourceDir = join(baseDir, 'source-artifacts');
    await fs.ensureDir(artifactsSourceDir);
    const attachmentPath = join(artifactsSourceDir, 'image.bmp');
    await fs.writeFile(attachmentPath, 'dummy-content', 'utf8');

    const instance: InstanceReport = {
      groupId: 'group',
      spec: 'spec',
      startTime: new Date().toISOString(),
      results: {
        stats: {
          suites: 1,
          tests: 1,
          passes: 1,
          pending: 0,
          skipped: 0,
          failures: 0,
          flaky: 0,
          wallClockStartedAt: new Date().toISOString(),
          wallClockEndedAt: new Date().toISOString(),
          wallClockDuration: 1,
        },
        tests: [
          {
            _t: Date.now(),
            testId: 't1',
            title: ['suite', 'name'],
            state: 'passed',
            isFlaky: false,
            expectedStatus: 'passed',
            timeout: 0,
            location: { line: 1, column: 1, file: 'spec' },
            retries: 0,
            attempts: [
              {
                _s: 'passed',
                attempt: 0,
                startTime: new Date().toISOString(),
                steps: [],
                duration: 1,
                status: 'passed',
                stdout: [
                  'log line',
                  `[[ATTACHMENT|${attachmentPath}]]`,
                ],
                stderr: ['stderr line'],
                errors: [],
                error: undefined,
              },
            ],
          },
        ],
      },
    };

    mockedInstanceMap = new Map([['k', instance]]);

    setConvertCommandConfig({
      inputFormat: 'junit' as any,
      inputFiles: ['dummy.xml'],
      outputDir: baseDir,
      framework: 'vitest' as any,
    });

    await handleConvert();

    const artifactsDir = join(baseDir, 'artifacts');
    const instancesDir = join(baseDir, 'instances');

    const instanceFiles = await fs.readdir(instancesDir);
    expect(instanceFiles.length).toBe(1);

    const instanceJsonPath = join(instancesDir, instanceFiles[0]);
    const content = await fs.readFile(instanceJsonPath, 'utf8');
    const parsed = JSON.parse(content) as InstanceReport;

    const testEntry = parsed.results.tests[0];
    const attempt = testEntry.attempts[0];

    expect(attempt.artifacts).toBeDefined();
    expect(attempt.artifacts?.length).toBe(3);

    const stdoutArtifact = attempt.artifacts?.find(
      (a) => a.type === 'stdout'
    );
    const stderrArtifact = attempt.artifacts?.find(
      (a) => a.type === 'stderr'
    );
    const attachmentArtifact = attempt.artifacts?.find(
      (a) => a.type === 'screenshot'
    );

    expect(stdoutArtifact).toBeDefined();
    expect(stderrArtifact).toBeDefined();
    expect(attachmentArtifact).toBeDefined();

    expect(stdoutArtifact?.contentType).toBe('text/plain');
    expect(stderrArtifact?.contentType).toBe('text/plain');
    expect(attachmentArtifact?.contentType).toBe('image/bmp');

    if (stdoutArtifact) {
      const p = join(baseDir, stdoutArtifact.path);
      expect(await fs.pathExists(p)).toBe(true);
    }

    if (stderrArtifact) {
      const p = join(baseDir, stderrArtifact.path);
      expect(await fs.pathExists(p)).toBe(true);
    }

    if (attachmentArtifact) {
      const p = join(baseDir, attachmentArtifact.path);
      expect(await fs.pathExists(p)).toBe(true);
    }

    const writtenArtifacts = await fs.readdir(artifactsDir);
    expect(writtenArtifacts.length).toBe(3);
  });
});
