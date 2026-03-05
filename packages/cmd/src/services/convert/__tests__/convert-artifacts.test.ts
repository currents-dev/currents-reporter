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

  it('processes attachment artifacts', async () => {
    const baseDir = await fs.mkdtemp(
      join(process.cwd(), 'currents-convert-artifacts-')
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
                stdout: ['log line'],
                stderr: ['stderr line'],
                errors: [],
                error: undefined,
                artifacts: [
                  {
                    path: attachmentPath,
                    type: 'screenshot',
                    contentType: 'image/bmp',
                  },
                ],
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
    expect(attempt.artifacts?.length).toBe(1);

    const attachmentArtifact = attempt.artifacts?.find(
      (a) => a.type === 'screenshot'
    );

    expect(attachmentArtifact).toBeDefined();

    expect(attachmentArtifact?.contentType).toBe('image/bmp');

    if (attachmentArtifact) {
      const p = join(baseDir, attachmentArtifact.path);
      expect(await fs.pathExists(p)).toBe(true);
    }

    const writtenArtifacts = await fs.readdir(artifactsDir);
    expect(writtenArtifacts.length).toBe(1);
  });

  it('creates spec level artifacts', async () => {
    const baseDir = await fs.mkdtemp(
      join(process.cwd(), 'currents-convert-artifacts-')
    );
    tmpDirs.push(baseDir);

    const artifactsSourceDir = join(baseDir, 'source-artifacts');
    await fs.ensureDir(artifactsSourceDir);
    const specArtifactPath = join(artifactsSourceDir, 'spec.txt');
    await fs.writeFile(specArtifactPath, 'spec-artifact-content', 'utf8');

    const instance: InstanceReport = {
      groupId: 'group',
      spec: 'spec',
      startTime: new Date().toISOString(),
      artifacts: [
        {
          path: specArtifactPath,
          type: 'attachment',
          contentType: 'text/plain',
        },
      ],
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
        tests: [],
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

    expect(parsed.artifacts).toBeDefined();
    expect(parsed.artifacts?.length).toBe(1);

    const specArtifact = parsed.artifacts?.[0];
    expect(specArtifact).toBeDefined();
    expect(specArtifact?.type).toBe('attachment');
    expect(specArtifact?.path).toContain('artifacts/');

    if (specArtifact) {
      const p = join(baseDir, specArtifact.path);
      expect(await fs.pathExists(p)).toBe(true);
      const content = await fs.readFile(p, 'utf8');
      expect(content).toBe('spec-artifact-content');
    }
  });
});
