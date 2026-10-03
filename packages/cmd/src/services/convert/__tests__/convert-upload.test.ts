import fs from 'fs-extra';
import os from 'os';
import { join } from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  ApiServer,
  RecordedRequest,
  startApiServer,
} from '../../../test-utils/api-server';
import { CliResult, runCli } from '../../../test-utils/cli';

const junitDir = join(__dirname, 'fixtures/junit');

const frameworks = [
  ['postman', 'newman.xml'],
  ['vitest', 'vitest.xml'],
  ['node', 'node.xml'],
  ['wdio', 'wdio.xml'],
] as const;

describe('currents run upload --input-format, with the built CLI', () => {
  let api: ApiServer;
  let workDir: string;
  let artifactUploads: { path: string; contentType?: string; body: string }[];

  beforeEach(async () => {
    artifactUploads = [];
    workDir = await fs.mkdtemp(join(os.tmpdir(), 'currents-convert-'));
    await fs.copy(junitDir, join(workDir, 'junit'));
    api = await startApiServer(respond);
  });

  afterEach(async () => {
    await api.close();
    await fs.remove(workDir);
  });

  function respond(request: RecordedRequest) {
    if (request.method === 'PUT') {
      artifactUploads.push({
        path: decodeURIComponent(request.url.split('?path=')[1]),
        contentType: request.headers['content-type'],
        body: request.body.toString(),
      });
      return { status: 200 };
    }

    const instances: { artifacts?: { path: string }[] }[] =
      request.json.instances;
    const artifacts = instances.flatMap((instance) => instance.artifacts ?? []);
    return {
      status: 200,
      json: {
        runId: 'run',
        groupId: request.json.group,
        runUrl: `${api.url}/run`,
        artifactUploadUrls: artifacts.map(({ path }, index) => ({
          artifactId: `artifact-${index}`,
          path,
          uploadUrl: `${api.url}/upload?path=${encodeURIComponent(path)}`,
          readUrl: `${api.url}/read/${index}`,
        })),
      },
    };
  }

  const cli = (args: string[]) =>
    runCli(args, { cwd: workDir, env: { CURRENTS_API_URL: api.url } });

  const convertOptions = (framework: string, files: string[]) => [
    '--input-format',
    'junit',
    '--input-file',
    files.map((file) => join(workDir, 'junit', file)).join(','),
    '--framework',
    framework,
    '--output-dir',
    join(workDir, 'out'),
  ];

  const convertAndUpload = (
    framework: string,
    files: string[],
    options: string[] = []
  ) =>
    cli([
      'run',
      'upload',
      ...convertOptions(framework, files),
      ...options,
      '--key',
      'record-key',
      '--project-id',
      'project',
      '--ci-build-id',
      'build',
    ]);

  const expectSuccess = (result: CliResult) => {
    expect(result.stderr).toBe('');
    expect(result.code).toBe(0);
  };

  describe.each(frameworks)('%s', (framework, file) => {
    it('sends the converted results to the API', async () => {
      expectSuccess(await convertAndUpload(framework, [file]));

      expect(
        api.requests.filter((r) => r.method === 'POST').map(normalize)
      ).toMatchSnapshot();
    });
  });

  // The hidden convert command only converts.
  it('writes the report files with currents convert', async () => {
    expectSuccess(
      await cli(['convert', ...convertOptions('vitest', ['vitest.xml'])])
    );

    expect(await fs.readJson(join(workDir, 'out/config.json'))).toEqual({
      framework: 'junit',
      frameworkVersion: null,
      frameworkConfig: { originFramework: 'vitest' },
    });
    expect(await fs.readdir(join(workDir, 'out/instances'))).toHaveLength(1);
    expect(await fs.pathExists(join(workDir, 'out/fullTestSuite.json'))).toBe(
      true
    );
    expect(api.requests).toEqual([]);
  });

  it('records the framework version of the converted report', async () => {
    expectSuccess(
      await convertAndUpload(
        'vitest',
        ['vitest.xml'],
        ['--framework-version', '3.2.1']
      )
    );

    const [run] = api.requests;
    expect(run.json.framework).toMatchObject({
      type: 'junit',
      version: '3.2.1',
      frameworkConfig: {
        originFramework: 'vitest',
        originFrameworkVersion: '3.2.1',
      },
    });
  });

  it('uploads the output of a suite as a text artifact', async () => {
    expectSuccess(await convertAndUpload('vitest', ['vitest.xml']));

    expect(artifactUploads).toEqual([
      {
        path: expect.stringMatching(/^artifacts\/.+\.stdout\.txt$/),
        contentType: 'text/plain',
        body: 'log line from the suite',
      },
    ]);
  });

  it('creates one run for each testsuites name of several input files', async () => {
    expectSuccess(
      await convertAndUpload('postman', ['newman.xml', 'wdio.xml'])
    );

    const createRequests = api.requests.filter(
      (r) => r.json.instances.length === 0
    );
    expect(createRequests.map((r) => r.json.group).sort()).toEqual([
      'Shop API',
      'wdio',
    ]);
  });

  it('fails without sending anything when no input file has test results', async () => {
    await fs.writeFile(join(workDir, 'junit/empty.xml'), '   ');

    const result = await convertAndUpload('postman', ['empty.xml']);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain('No valid XML JUnit report was found');
    expect(api.requests).toEqual([]);
  });

  it('fails when the input pattern matches no file', async () => {
    const result = await convertAndUpload('postman', ['missing.xml']);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain(
      'No files found with the provided patterns'
    );
    expect(api.requests).toEqual([]);
  });

  it('fails for a framework that is not supported', async () => {
    const result = await convertAndUpload('mocha', ['vitest.xml']);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("argument 'mocha' is invalid");
    expect(api.requests).toEqual([]);
  });
});

// Removes what differs between runs of the test: the machine, the temporary
// directory, the git data of the machine, and the version of the CLI.
function normalize(request: RecordedRequest) {
  const body = request.json;
  return {
    method: request.method,
    url: request.url,
    body: {
      ...body,
      platform: '<platform>',
      commit: '<commit>',
      machineId: '<machine id>',
      framework: { ...body.framework, clientVersion: '<version>' },
      config: {
        currents: { ...body.config.currents, reportDir: '<report dir>' },
      },
    },
  };
}
