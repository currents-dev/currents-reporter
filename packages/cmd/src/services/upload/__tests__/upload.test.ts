import { execFile } from 'child_process';
import fs from 'fs-extra';
import http from 'http';
import { AddressInfo } from 'net';
import os from 'os';
import { join } from 'path';
import { promisify } from 'util';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import zlib from 'zlib';

const fixtureDir = join(__dirname, 'fixtures', 'jest-report');

// The built CLI. Pointing this at another build compares the two, e.g. the one
// on main.
const cliPath =
  process.env.CURRENTS_TEST_CLI ??
  join(__dirname, '../../../../dist/bin/index.js');

type RunRequest = {
  group: string;
  framework: unknown;
  fullTestSuite: unknown[];
  instances: {
    spec: string;
    results: {
      tests: {
        title: string[];
        artifacts?: { name?: string }[];
        attempts: { artifacts?: { name?: string }[]; steps: unknown[] }[];
      }[];
    };
  }[];
};

describe('currents upload', () => {
  let server: http.Server;
  let apiUrl: string;
  let runRequests: RunRequest[];
  let uploads: { path: string; contentType?: string; bytes: number }[];
  let reportDir: string;
  let artifactsRootDir: string;

  beforeAll(() => {
    if (!fs.existsSync(cliPath)) {
      throw new Error(`Build the CLI first: ${cliPath} is missing`);
    }
  });

  beforeEach(async () => {
    runRequests = [];
    uploads = [];
    server = http.createServer(handleApiRequest);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    apiUrl = `http://localhost:${(server.address() as AddressInfo).port}`;

    reportDir = await fs.mkdtemp(join(os.tmpdir(), 'currents-upload-report-'));
    artifactsRootDir = await fs.mkdtemp(
      join(os.tmpdir(), 'currents-upload-artifacts-')
    );
    await fs.copy(fixtureDir, reportDir);
  });

  afterEach(async () => {
    await new Promise((resolve) => server.close(resolve));
    await fs.remove(reportDir);
    await fs.remove(artifactsRootDir);
  });

  it('sends the results and uploads their artifacts', async () => {
    await upload();

    expect({
      runRequests: runRequests.sort(byGroupAndSize),
      uploads,
    }).toMatchSnapshot();
  });

  it('attaches Detox artifacts, steps and the trace', async () => {
    await writeDetoxFiles();

    await upload();

    const tests = runRequests
      .flatMap((request) => request.instances)
      .flatMap((instance) => instance.results.tests);
    const failed = tests.find((test) => test.title.join(' ') === 'basic fails');
    const firstOfSpec = tests.find(
      (test) => test.title.join(' ') === 'basic passes'
    );

    expect(failed?.attempts[0].artifacts?.map((a) => a.name)).toEqual([
      undefined, // the screenshot the fixture already had
      'device.log',
      'test.mp4',
    ]);
    expect(failed?.attempts[0].steps).toEqual([
      {
        title: 'tap on view with id "send"',
        category: 'detox',
        startTime: new Date(1_769_000_000_001).toISOString(),
        duration: 250,
        steps: [],
      },
    ]);
    expect(firstOfSpec?.artifacts?.map((a) => a.name)).toEqual([
      'detox.trace.json',
    ]);
    // The trace goes once to each of the three spec files.
    expect(uploads.map((u) => u.contentType).sort()).toEqual([
      'application/json',
      'application/json',
      'application/json',
      'image/png',
      'text/plain',
      'video/mp4',
    ]);
  });

  async function upload() {
    await promisify(execFile)(
      process.execPath,
      [
        cliPath,
        'upload',
        '--report-dir',
        reportDir,
        '--project-id',
        'project',
        '--key',
        'record-key',
        '--ci-build-id',
        'build',
      ],
      { cwd: reportDir, env: { ...process.env, CURRENTS_API_URL: apiUrl } }
    );
  }

  async function writeDetoxFiles() {
    const failedDir = join(artifactsRootDir, '✗ basic fails');
    await fs.ensureDir(failedDir);
    await fs.writeFile(join(failedDir, 'device.log'), 'log');
    await fs.writeFile(join(failedDir, 'test.mp4'), 'video');

    const testStart = 1_769_000_000_000_000;
    const span = { pid: 1, cat: 'ws-client,ws-client-invocation', tid: 1 };
    await fs.writeJson(join(artifactsRootDir, 'detox.trace.json'), [
      {
        ph: 'B',
        name: 'fails',
        pid: 1,
        tid: 0,
        ts: testStart,
        args: { context: 'test', fullName: 'basic fails', invocations: 1 },
      },
      {
        ...span,
        ph: 'B',
        name: 'tap on view with id "send"',
        ts: testStart + 1000,
      },
      { ...span, ph: 'E', ts: testStart + 251_000 },
      { ph: 'E', pid: 1, tid: 0, ts: testStart + 400_000 },
    ]);

    const instances = await Promise.all(
      (await fs.readdir(join(reportDir, 'instances'))).map((fileName) =>
        fs.readJson(join(reportDir, 'instances', fileName))
      )
    );
    const failed = instances
      .flatMap((instance) => instance.results.tests)
      .find((test) => test.title.join(' ') === 'basic fails');

    await fs.writeJson(join(reportDir, 'detox.json'), {
      artifactsRootDir,
      configuration: 'ios.sim.debug',
      testSessionIndex: 0,
      tests: [
        {
          testId: failed.testId,
          fullName: 'basic fails',
          attempts: [
            { attempt: 0, session: 0, invocations: 1, status: 'failed' },
          ],
        },
      ],
    });
  }

  async function handleApiRequest(
    req: http.IncomingMessage,
    res: http.ServerResponse
  ) {
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }
    const body = Buffer.concat(chunks);

    if (req.method === 'PUT') {
      uploads.push({
        path: decodeURIComponent(req.url?.split('?path=')[1] ?? ''),
        contentType: req.headers['content-type'],
        bytes: body.length,
      });
      res.writeHead(200).end();
      return;
    }

    const request: RunRequest = JSON.parse(zlib.gunzipSync(body).toString());
    runRequests.push({
      group: request.group,
      // Changes with every release of the CLI.
      framework: {
        ...(request.framework as object),
        clientVersion: '<version>',
      },
      fullTestSuite: request.fullTestSuite,
      instances: request.instances,
    });

    const artifactPaths = request.instances.flatMap((instance) =>
      instance.results.tests.flatMap((test) => [
        ...(test.artifacts ?? []),
        ...test.attempts.flatMap((attempt) => attempt.artifacts ?? []),
      ])
    ) as { path: string }[];

    res.writeHead(200, { 'Content-Type': 'application/json' }).end(
      JSON.stringify({
        runId: 'run',
        groupId: request.group,
        runUrl: `${apiUrl}/run`,
        artifactUploadUrls: artifactPaths.map(({ path }, index) => ({
          artifactId: `artifact-${index}`,
          path,
          uploadUrl: `${apiUrl}/upload?path=${encodeURIComponent(path)}`,
          readUrl: `${apiUrl}/read/${index}`,
        })),
      })
    );
  }
});

function byGroupAndSize(a: RunRequest, b: RunRequest) {
  return (
    a.group.localeCompare(b.group) || a.instances.length - b.instances.length
  );
}
