import fs from 'fs-extra';
import { join } from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { InstanceReport } from '../../../../types';
import { attachDetoxArtifacts } from '../collect';
import { DetoxManifest } from '../manifest';
import { getTestArtifactsDir } from '../paths';

describe('getTestArtifactsDir', () => {
  const rootDir = 'artifacts/android.emu.debug.2026-09-22';

  it('marks the status of the attempt', () => {
    expect(
      getTestArtifactsDir({
        rootDir,
        fullName: 'transfer sends coins',
        status: 'failed',
        invocations: 1,
      })
    ).toBe(`${rootDir}/✗ transfer sends coins`);

    expect(
      getTestArtifactsDir({
        rootDir,
        fullName: 'transfer sends coins',
        status: 'passed',
        invocations: 1,
      })
    ).toBe(`${rootDir}/✓ transfer sends coins`);
  });

  it('numbers the directory of a retried attempt', () => {
    expect(
      getTestArtifactsDir({
        rootDir,
        fullName: 'transfer sends coins',
        status: 'passed',
        invocations: 2,
      })
    ).toBe(`${rootDir}/✓ transfer sends coins (2)`);
  });

  it('replaces the characters Detox cannot put in a file name', () => {
    expect(
      getTestArtifactsDir({
        rootDir,
        fullName: 'a/b c:d*e?f"g<h>i|j$k',
        status: 'failed',
        invocations: 1,
      })
    ).toBe(`${rootDir}/✗ a_b c_d_e_f_g_h_i_j_k`);
  });

  it('keeps the name within the 255 byte file name limit', () => {
    const dir = getTestArtifactsDir({
      rootDir,
      fullName: 'x'.repeat(300),
      status: 'failed',
      invocations: 2,
    });

    expect(Buffer.byteLength(dir.slice(rootDir.length + 1), 'utf8')).toBe(255);
  });
});

describe('attachDetoxArtifacts', () => {
  let reportDir: string;
  let artifactsRootDir: string;

  const manifest = (): DetoxManifest => ({
    artifactsRootDir,
    configuration: 'android.emu.debug',
    tests: [
      {
        testId: 'test-1',
        fullName: 'transfer sends coins',
        attempts: [
          { attempt: 0, invocations: 1, status: 'failed' },
          { attempt: 1, invocations: 2, status: 'passed' },
        ],
      },
    ],
  });

  const instance = (): InstanceReport =>
    ({
      groupId: 'root',
      spec: 'e2e/transfer.test.js',
      startTime: '2026-09-22T07:24:35.079Z',
      results: {
        stats: {} as InstanceReport['results']['stats'],
        tests: [
          {
            testId: 'test-1',
            attempts: [{ attempt: 0 }, { attempt: 1 }],
          },
        ],
      },
    }) as unknown as InstanceReport;

  beforeEach(async () => {
    reportDir = await fs.mkdtemp('/tmp/currents-detox-report-');
    artifactsRootDir = await fs.mkdtemp('/tmp/currents-detox-artifacts-');

    const failedDir = join(artifactsRootDir, '✗ transfer sends coins');
    await fs.ensureDir(failedDir);
    await fs.writeFile(join(failedDir, 'test.mp4'), 'video');
    await fs.writeFile(join(failedDir, 'device.log'), 'log');
    await fs.writeFile(join(failedDir, 'test-after-failure.png'), 'image');
    await fs.writeFile(join(failedDir, 'ignored.bin'), 'binary');

    const passedDir = join(artifactsRootDir, '✓ transfer sends coins (2)');
    await fs.ensureDir(passedDir);
    await fs.writeFile(join(passedDir, 'test.mp4'), 'video');
  });

  afterEach(async () => {
    await fs.remove(reportDir);
    await fs.remove(artifactsRootDir);
  });

  it('attaches the artifacts of each attempt and copies them into the report', async () => {
    const instances = [instance()];
    const attached = await attachDetoxArtifacts({
      instances,
      reportDir,
      manifest: manifest(),
    });

    expect(attached).toBe(4);

    const [firstAttempt, secondAttempt] =
      instances[0].results.tests[0].attempts;

    expect(firstAttempt.artifacts).toEqual([
      {
        name: 'device.log',
        type: 'attachment',
        contentType: 'text/plain',
        path: expect.stringMatching(/^artifacts\/.+\.log$/),
      },
      {
        name: 'test-after-failure.png',
        type: 'screenshot',
        contentType: 'image/png',
        path: expect.stringMatching(/^artifacts\/.+\.png$/),
      },
      {
        name: 'test.mp4',
        type: 'video',
        contentType: 'video/mp4',
        path: expect.stringMatching(/^artifacts\/.+\.mp4$/),
      },
    ]);
    expect(secondAttempt.artifacts).toHaveLength(1);

    const copied = await fs.readdir(join(reportDir, 'artifacts'));
    expect(copied).toHaveLength(4);
  });

  it('leaves the results alone when the test is not in the manifest', async () => {
    const instances = [instance()];
    instances[0].results.tests[0].testId = 'other-test';

    const attached = await attachDetoxArtifacts({
      instances,
      reportDir,
      manifest: manifest(),
    });

    expect(attached).toBe(0);
    expect(instances[0].results.tests[0].attempts[0].artifacts).toBeUndefined();
  });
});
