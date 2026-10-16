import { execFile } from 'child_process';
import crypto from 'crypto';
import fs from 'fs-extra';
import http from 'http';
import { AddressInfo } from 'net';
import os from 'os';
import { join } from 'path';
import { promisify } from 'util';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import zlib from 'zlib';

const fixtureDir = join(__dirname, 'fixtures', 'jest-report');
// A Jest project whose test environment stands in for Detox's: it appends to
// DEVICE_LOG where Detox boots a device.
const detoxProjectDir = join(__dirname, 'fixtures', 'detox-project');

// The built CLI. Pointing this at another build compares the two, e.g. the one
// on main.
const cliPath =
  process.env.CURRENTS_TEST_CLI ??
  join(__dirname, '../../../../dist/bin/index.js');

type RunRequest = {
  group: string;
  framework: unknown;
  fullTestSuite: {
    name: string;
    tests: { spec: string; testId: string; title: string[] }[];
  }[];
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

describe('currents run upload', () => {
  let server: http.Server;
  let apiUrl: string;
  let runRequests: RunRequest[];
  let uploads: { path: string; contentType?: string; bytes: number }[];
  // null answers the actions request with 404
  let projectActions: unknown[] | null;
  let actionsRequests: { url?: string; recordKey?: string }[];
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
    projectActions = [];
    actionsRequests = [];
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

  it('applies the project actions to the results', async () => {
    projectActions = [
      {
        _id: 'quarantine-id',
        v: 0,
        name: 'Quarantine basic fails',
        action: [{ op: 'quarantine' }],
        matcher: {
          op: 'AND',
          cond: [
            { type: 'file', op: 'eq', value: 'specs/basic.check.js' },
            { type: 'title', op: 'eq', value: 'fails' },
          ],
        },
      },
      {
        _id: 'skip-id',
        v: 0,
        name: 'Skip probes',
        action: [{ op: 'skip' }],
        matcher: {
          op: 'AND',
          cond: [{ type: 'project', op: 'eq', value: 'probes' }],
        },
      },
      {
        _id: 'tag-id',
        v: 0,
        name: 'Tag retries',
        action: [{ op: 'tag', details: { tags: ['flaky'] } }],
        matcher: {
          op: 'AND',
          cond: [{ type: 'file', op: 'eq', value: 'specs/retries.check.js' }],
        },
      },
    ];

    await upload();

    expect(actionsRequests).toEqual([
      { url: '/rules/project/project', recordKey: 'record-key' },
    ]);

    const tests = runRequests
      .flatMap((request) => request.instances)
      .flatMap((instance) => instance.results.tests) as unknown as {
      title: string[];
      state: string;
      tags?: string[];
      annotations?: { type: string; description: string }[];
      attempts: { status: string; errors: unknown[] }[];
    }[];
    const byTitle = (title: string) =>
      tests.find((test) => test.title.join(' ') === title)!;
    const annotation = (title: string) => {
      const [first] = byTitle(title).annotations ?? [];
      return first && { ...first, description: JSON.parse(first.description) };
    };

    // The quarantined test keeps the results of its attempts
    expect(byTitle('basic fails').state).toBe('pending');
    expect(
      byTitle('basic fails').attempts.map((attempt) => attempt.status)
    ).toEqual(['failed']);
    expect(byTitle('basic fails').attempts[0].errors).not.toHaveLength(0);
    expect(annotation('basic fails')).toMatchObject({
      type: '_currents:rule:quarantine-post',
      description: {
        rule: {
          id: 'quarantine-id',
          name: 'Quarantine basic fails',
          type: 'quarantine',
          extraDetails: { status: 'failed' },
        },
        testInfo: { status: 'failed' },
      },
    });

    // A passed test is not quarantined
    expect(byTitle('basic passes').state).toBe('passed');
    expect(byTitle('basic passes').annotations).toBeUndefined();

    expect(byTitle('responds').state).toBe('pending');
    expect(byTitle('responds').attempts.map((a) => a.status)).toEqual([
      'passed',
    ]);
    expect(annotation('responds')).toMatchObject({
      type: '_currents:rule:skip-post',
      description: { rule: { id: 'skip-id', type: 'skip' } },
    });

    expect(byTitle('retries fails every attempt').tags).toContain('flaky');
    expect(byTitle('retries fails every attempt').state).toBe('failed');
    expect(annotation('retries fails every attempt')).toMatchObject({
      type: '_currents:rule:tag',
      description: {
        rule: { id: 'tag-id', extraDetails: { tags: ['@flaky'] } },
      },
    });
    expect(
      runRequests[0].fullTestSuite
        .flatMap(
          (project) => project.tests as { spec: string; tags?: string[] }[]
        )
        .filter((test) => test.spec === 'specs/retries.check.js')
        .map((test) => test.tags)
    ).toEqual([['flaky'], ['flaky'], ['flaky']]);
    // The API adds the tags of a project to every test of the project
    const checks = runRequests[0].fullTestSuite.find(
      (project) => project.name === 'checks'
    ) as unknown as { tags: string[] };
    expect(checks.tags).not.toContain('flaky');
  });

  it('uploads the results without actions when they cannot be fetched', async () => {
    projectActions = null;
    const { stdout } = await upload();
    expect(stdout).toContain('Failed to fetch the project actions');
    expect(runRequests.length).toBeGreaterThan(0);
  });

  describe('--fail-on-failures', () => {
    const quarantineFailures = {
      _id: 'quarantine-id',
      v: 0,
      name: 'Quarantine failures',
      action: [{ op: 'quarantine' }],
      matcher: {
        op: 'OR',
        cond: [
          { type: 'title', op: 'eq', value: 'fails' },
          { type: 'title', op: 'eq', value: 'fails every attempt' },
        ],
      },
    };

    it('exits with 1 after uploading when a test failed', async () => {
      const error = await upload({ args: ['--fail-on-failures'] }).catch(
        (e) => e
      );

      expect(error.code).toBe(1);
      expect(error.stderr).toContain('2 tests failed (--fail-on-failures):');
      expect(error.stderr).toContain('specs/basic.check.js: basic > fails');
      expect(error.stderr).toContain(
        'specs/retries.check.js: retries > fails every attempt'
      );
      expect(runRequests.length).toBeGreaterThan(0);
    });

    it('exits with 0 when every failed test is quarantined', async () => {
      projectActions = [quarantineFailures];

      await expect(
        upload({ env: { CURRENTS_FAIL_ON_FAILURES: 'true' } })
      ).resolves.toBeDefined();
    });

    it('lists only the failed tests that no action quarantined', async () => {
      projectActions = [
        {
          ...quarantineFailures,
          matcher: {
            op: 'AND',
            cond: [{ type: 'file', op: 'eq', value: 'specs/basic.check.js' }],
          },
        },
      ];

      const error = await upload({
        env: { CURRENTS_FAIL_ON_FAILURES: 'true' },
      }).catch((e) => e);

      expect(error.code).toBe(1);
      expect(error.stderr).toContain('1 test failed (--fail-on-failures):');
      expect(error.stderr).not.toContain('basic > fails');
    });

    it('is off when the environment variable is false', async () => {
      await expect(
        upload({ env: { CURRENTS_FAIL_ON_FAILURES: 'false' } })
      ).resolves.toBeDefined();
    });
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

  describe('the list of every test of the run', () => {
    let deviceLog: string;
    let emptyDir: string;

    beforeEach(async () => {
      await fs.emptyDir(reportDir);
      emptyDir = await fs.mkdtemp(join(os.tmpdir(), 'currents-upload-cwd-'));
      deviceLog = join(emptyDir, 'device.log');
    });

    afterEach(async () => {
      await fs.remove(emptyDir);
    });

    it('takes the tests of a run that is not sharded from the results, without Jest', async () => {
      await writeJestReport({
        frameworkConfig: { rootDir: detoxProjectDir },
        cliArgs: { options: { testNamePattern: 'signs in' }, args: [] },
        results: { 'login.e2e.js': ['signs in', 'signs out'] },
      });

      // A folder without Jest
      await upload({ cwd: emptyDir });

      expect(getFullTestSuite()).toEqual({
        root: ['login.e2e.js: login signs in', 'login.e2e.js: login signs out'],
      });
      expect(runRequests[0].group).toBe('root');
    });

    it.each([
      { name: 'empty', contents: '' },
      { name: 'not a list', contents: '{}' },
      { name: 'an empty list', contents: '[]' },
      {
        name: 'a list with a project without tests',
        contents: '[{"name":"root","tags":[],"tests":[]}]',
      },
      { name: 'a list of other values', contents: '[{"name":"root"}]' },
      {
        name: 'a list with a title that is not text',
        contents:
          '[{"name":"root","tags":[],"tests":[{"spec":"cart.e2e.js","testId":"1","title":[42],"tags":[]}]}]',
      },
    ])('ignores a fullTestSuite.json that is $name', async ({ contents }) => {
      await writeJestReport({
        frameworkConfig: { rootDir: detoxProjectDir },
        cliArgs: { options: {}, args: [] },
        results: { 'cart.e2e.js': ['adds an item'] },
      });
      await fs.writeFile(join(reportDir, 'fullTestSuite.json'), contents);

      await upload({ cwd: emptyDir });

      expect(getFullTestSuite()).toEqual({
        root: ['cart.e2e.js: cart adds an item'],
      });
    });

    it.each([
      {
        name: 'a run by detox test',
        config: 'jest.config.js',
        originFramework: 'detox',
      },
      {
        name: 'a project with Detox in its Jest config',
        config: 'jest.detox.config.js',
        originFramework: undefined,
      },
    ])(
      'lists the tests of a Detox shard without the device: $name',
      async ({ config, originFramework }) => {
        await writeJestReport({
          frameworkConfig: {
            rootDir: detoxProjectDir,
            shard: { shardIndex: 1, shardCount: 2 },
            originFramework,
          },
          cliArgs: { options: { config, shard: '1/2' }, args: [] },
          // launch.e2e.js uses the device while loading, so discovery cannot
          // load it, and its tests come from these results.
          results: { 'launch.e2e.js': ['shows the home screen'] },
        });

        const { stdout, stderr } = await upload({
          cwd: detoxProjectDir,
          env: { DEVICE_LOG: deviceLog },
        });

        expect(await readDeviceLog()).toEqual([]);
        expect(getFullTestSuite()).toEqual({
          root: [
            'cart.e2e.js: cart adds an item',
            'launch.e2e.js: launch shows the home screen',
            'login.e2e.js: login signs in',
            'login.e2e.js: login signs out',
          ],
        });
        expect(stdout).toContain('Discovery could not load launch.e2e.js');
      }
    );

    it('lists the tests of a Jest shard with the project test environment', async () => {
      await writeJestReport({
        frameworkConfig: {
          rootDir: detoxProjectDir,
          shard: { shardIndex: 1, shardCount: 2 },
        },
        cliArgs: { options: { shard: '1/2' }, args: [] },
        results: { 'cart.e2e.js': ['adds an item'] },
      });

      await upload({ cwd: detoxProjectDir, env: { DEVICE_LOG: deviceLog } });

      expect(await readDeviceLog()).toEqual(['setup', 'setup', 'setup']);
      expect(getFullTestSuite()).toEqual({
        root: [
          'cart.e2e.js: cart adds an item',
          'launch.e2e.js: launch shows the home screen',
          'login.e2e.js: login signs in',
          'login.e2e.js: login signs out',
        ],
      });
    });

    it('fails a JUnit upload whose fullTestSuite.json is not a list of projects', async () => {
      await writeJestReport({
        frameworkConfig: {},
        cliArgs: { options: {}, args: [] },
        results: { 'cart.e2e.js': ['adds an item'] },
      });
      await fs.writeJson(join(reportDir, 'config.json'), {
        framework: 'junit',
        frameworkVersion: null,
        cliArgs: {},
        frameworkConfig: {},
      });
      await fs.writeFile(join(reportDir, 'fullTestSuite.json'), '{}');

      await expect(upload({ cwd: emptyDir })).rejects.toMatchObject({
        stderr: expect.stringContaining(
          'Failed to discover the full test suite'
        ),
      });
      expect(runRequests).toEqual([]);
    });

    it('fails a shard upload where Jest is not installed', async () => {
      await writeJestReport({
        frameworkConfig: {
          rootDir: detoxProjectDir,
          shard: { shardIndex: 1, shardCount: 2 },
        },
        cliArgs: { options: { shard: '1/2' }, args: [] },
        results: { 'cart.e2e.js': ['adds an item'] },
      });

      await expect(upload({ cwd: emptyDir })).rejects.toMatchObject({
        stderr: expect.stringContaining('needs the "jest" package'),
      });
      expect(runRequests).toEqual([]);
    });

    async function readDeviceLog() {
      if (!(await fs.pathExists(deviceLog))) {
        return [];
      }
      return (await fs.readFile(deviceLog, 'utf8')).trim().split('\n');
    }

    function getFullTestSuite() {
      return Object.fromEntries(
        runRequests[0].fullTestSuite.map((project) => [
          project.name,
          project.tests
            .map((test) => `${test.spec}: ${test.title.join(' ')}`)
            .sort(),
        ])
      );
    }
  });

  // A report as @currents/jest writes it, with one passed test per title.
  async function writeJestReport({
    frameworkConfig,
    cliArgs,
    results,
  }: {
    frameworkConfig: Record<string, unknown>;
    cliArgs: { options: Record<string, unknown>; args: string[] };
    results: Record<string, string[]>;
  }) {
    await fs.writeJson(join(reportDir, 'config.json'), {
      framework: 'jest',
      frameworkVersion: '30.0.0',
      cliArgs,
      frameworkConfig,
    });

    for (const [spec, titles] of Object.entries(results)) {
      const describeTitle = spec.split('.')[0];
      await fs.outputJson(
        join(reportDir, 'instances', `${describeTitle}.json`),
        {
          // Jest names a project without displayName after its config id.
          groupId: 'c2b1e7d8f0a94e6b8d3c5a7f9e1b2d4c',
          spec,
          startTime: '2026-10-06T00:00:00.000Z',
          results: {
            stats: { suites: 1, tests: titles.length, passes: titles.length },
            tests: titles.map((title) => ({
              testId: getTestId([describeTitle, title], spec),
              title: [describeTitle, title],
              state: 'passed',
              attempts: [
                { attempt: 0, status: 'passed', steps: [], errors: [] },
              ],
            })),
          },
        }
      );
    }
  }

  async function upload({
    cwd = reportDir,
    env = {},
    args = [],
  }: { cwd?: string; env?: Record<string, string>; args?: string[] } = {}) {
    return promisify(execFile)(
      process.execPath,
      [
        cliPath,
        'run',
        'upload',
        '--report-dir',
        reportDir,
        '--project-id',
        'project',
        '--key',
        'record-key',
        '--ci-build-id',
        'build',
        ...args,
      ],
      { cwd, env: { ...process.env, CURRENTS_API_URL: apiUrl, ...env } }
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

    if (req.method === 'GET' && req.url?.startsWith('/rules/project/')) {
      actionsRequests.push({
        url: req.url,
        recordKey: req.headers['x-currents-key'] as string | undefined,
      });
      if (!projectActions) {
        res.writeHead(404).end();
        return;
      }
      res
        .writeHead(200, { 'Content-Type': 'application/json' })
        .end(JSON.stringify({ rules: projectActions }));
      return;
    }

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

// The test id the discovery reporter gives a test.
function getTestId(title: string[], spec: string) {
  return crypto
    .createHash('sha256')
    .update(title.join(' ') + spec)
    .digest('hex')
    .substring(0, 16);
}

function byGroupAndSize(a: RunRequest, b: RunRequest) {
  return (
    a.group.localeCompare(b.group) || a.instances.length - b.instances.length
  );
}
