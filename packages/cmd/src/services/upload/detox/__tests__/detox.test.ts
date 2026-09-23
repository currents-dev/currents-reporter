import os from 'os';
import fs from 'fs-extra';
import { join } from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { InstanceReport } from '../../../../types';
import { attachDetoxArtifacts } from '../collect';
import { DetoxManifest, readDetoxManifest } from '../manifest';
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
          { attempt: 0, session: 0, invocations: 1, status: 'failed' },
          { attempt: 1, session: 0, invocations: 2, status: 'passed' },
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

    expect(attached).toEqual({ artifacts: 4, steps: 0 });

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

    expect(attached).toEqual({ artifacts: 0, steps: 0 });
    expect(instances[0].results.tests[0].attempts[0].artifacts).toBeUndefined();
  });

  it('follows the Detox numbering of a rerun, where Jest restarts at attempt 0', async () => {
    const rerunDir = join(artifactsRootDir, '✓ transfer sends coins (3)');
    await fs.ensureDir(rerunDir);
    await fs.writeFile(join(rerunDir, 'test.mp4'), 'video');

    const instances = [instance()];
    instances[0].results.tests[0].attempts.push({ attempt: 2 } as never);

    const attached = await attachDetoxArtifacts({
      instances,
      reportDir,
      manifest: {
        ...manifest(),
        tests: [
          {
            testId: 'test-1',
            fullName: 'transfer sends coins',
            attempts: [
              { attempt: 0, session: 0, invocations: 1, status: 'failed' },
              { attempt: 1, session: 0, invocations: 2, status: 'passed' },
              // The rerun reported this as its own attempt 0.
              { attempt: 2, session: 1, invocations: 1, status: 'passed' },
            ],
          },
        ],
      },
    });

    expect(attached.artifacts).toBe(5);
    expect(instances[0].results.tests[0].attempts[2].artifacts).toEqual([
      {
        name: 'test.mp4',
        type: 'video',
        contentType: 'video/mp4',
        path: expect.stringMatching(/^artifacts\/.+\.mp4$/),
      },
    ]);
  });

  it('matches the attempts of a rerun, which Jest also reported as attempt 0', async () => {
    const instances = [instance()];
    const attached = await attachDetoxArtifacts({
      instances,
      reportDir,
      manifest: {
        ...manifest(),
        tests: [
          {
            testId: 'test-1',
            fullName: 'transfer sends coins',
            attempts: [
              { attempt: 0, session: 0, invocations: 1, status: 'failed' },
              { attempt: 0, session: 1, invocations: 1, status: 'passed' },
            ],
          },
        ],
      },
    });

    expect(attached.artifacts).toBe(4);

    const [firstAttempt, secondAttempt] =
      instances[0].results.tests[0].attempts;
    expect(firstAttempt.artifacts?.map((a) => a.name)).toEqual([
      'device.log',
      'test-after-failure.png',
      'test.mp4',
    ]);
    expect(secondAttempt.artifacts?.map((a) => a.name)).toEqual(['test.mp4']);
  });

  it('skips tests whose full name Detox cannot tell apart', async () => {
    const instances = [instance()];
    const attached = await attachDetoxArtifacts({
      instances,
      reportDir,
      manifest: {
        ...manifest(),
        tests: [
          manifest().tests[0],
          { ...manifest().tests[0], testId: 'test-2' },
        ],
      },
    });

    expect(attached).toEqual({ artifacts: 0, steps: 0 });
  });

  it('attaches the element actions of the trace as steps', async () => {
    const testStart = 1_769_000_000_000_000;
    await fs.writeJson(join(artifactsRootDir, 'detox.trace.json'), [
      {
        ph: 'B',
        name: 'sends coins',
        pid: 100,
        tid: 0,
        cat: 'lifecycle',
        ts: testStart,
        args: {
          context: 'test',
          status: 'running',
          fullName: 'transfer sends coins',
          invocations: 1,
        },
      },
      {
        ph: 'B',
        name: 'tap on view with id "send-button"',
        pid: 100,
        tid: 1,
        cat: 'ws-client,ws-client-invocation',
        ts: testStart + 1000,
        args: {},
      },
      {
        ph: 'E',
        pid: 100,
        tid: 1,
        cat: 'ws-client,ws-client-invocation',
        ts: testStart + 251_000,
      },
      { ph: 'E', pid: 100, tid: 0, cat: 'lifecycle', ts: testStart + 400_000 },
    ]);

    const instances = [instance()];
    const attached = await attachDetoxArtifacts({
      instances,
      reportDir,
      manifest: manifest(),
    });

    expect(attached.steps).toBe(1);
    expect(instances[0].results.tests[0].attempts[0].steps).toEqual([
      {
        title: 'tap on view with id "send-button"',
        category: 'detox',
        startTime: new Date((testStart + 1000) / 1e3).toISOString(),
        duration: 250,
        steps: [],
      },
    ]);
  });

  it('attaches the actions that run after the hooks of the test', async () => {
    const testStart = 1_769_000_000_000_000;
    const lifecycle = { pid: 100, tid: 12, cat: 'lifecycle,jest-environment' };
    const invocation = {
      pid: 100,
      tid: 3,
      cat: 'ws-client, ws,ws-client-invocation',
    };
    await fs.writeJson(join(artifactsRootDir, 'detox.trace.json'), [
      {
        ...lifecycle,
        ph: 'B',
        name: 'sends coins',
        ts: testStart,
        args: {
          context: 'test',
          status: 'running',
          fullName: 'transfer sends coins',
          invocations: 1,
        },
      },
      { ...lifecycle, ph: 'B', name: 'beforeEach', ts: testStart + 1000 },
      { ...lifecycle, ph: 'E', ts: testStart + 2000 },
      { ...lifecycle, ph: 'B', name: 'test_fn', ts: testStart + 3000 },
      { ...invocation, ph: 'B', name: 'tap', ts: testStart + 4000 },
      { ...invocation, ph: 'E', ts: testStart + 5000 },
      { ...lifecycle, ph: 'E', ts: testStart + 6000 },
      { ...lifecycle, ph: 'E', ts: testStart + 7000 },
    ]);

    const instances = [instance()];
    const attached = await attachDetoxArtifacts({
      instances,
      reportDir,
      manifest: manifest(),
    });

    expect(attached.steps).toBe(1);
    expect(instances[0].results.tests[0].attempts[0].steps).toMatchObject([
      { title: 'tap', duration: 1 },
    ]);
  });

  it('attaches the trace file to the first test of each spec file', async () => {
    await fs.writeJson(join(artifactsRootDir, 'detox.trace.json'), []);

    const empty = instance();
    empty.spec = 'e2e/empty.test.js';
    empty.results.tests = [];
    const instances = [instance(), empty];
    const attached = await attachDetoxArtifacts({
      instances,
      reportDir,
      manifest: manifest(),
    });

    const [trace] = instances[0].results.tests[0].artifacts ?? [];
    expect(trace).toMatchObject({
      type: 'attachment',
      contentType: 'application/json',
      name: 'detox.trace.json',
    });
    expect(await fs.pathExists(join(reportDir, trace.path))).toBe(true);
    expect(attached.artifacts).toBe(4 + 1);
  });
});

describe('readDetoxManifest', () => {
  let reportDir: string;

  beforeEach(async () => {
    reportDir = await fs.mkdtemp(join(os.tmpdir(), 'detox-manifest-'));
  });

  afterEach(async () => {
    await fs.remove(reportDir);
  });

  it('treats a manifest without a list of tests as absent', async () => {
    await fs.writeJson(join(reportDir, 'detox.json'), {
      artifactsRootDir: 'artifacts',
    });

    expect(await readDetoxManifest(reportDir)).toBeUndefined();
  });
});
