import fs from 'fs-extra';
import os from 'os';
import { join } from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ApiServer, startApiServer } from '../../test-utils/api-server';
import { CliResult, runCli } from '../../test-utils/cli';

const fixtureDir = join(
  __dirname,
  '../../services/upload/__tests__/fixtures/jest-report'
);

const credentials = ['--key', 'record-key', '--project-id', 'project'];

describe('exit codes and error output of the built CLI', () => {
  let api: ApiServer;
  let status: number;
  let workDir: string;

  beforeEach(async () => {
    status = 200;
    workDir = await fs.mkdtemp(join(os.tmpdir(), 'currents-exit-'));
    await fs.copy(fixtureDir, join(workDir, 'report'));
    await fs.writeFile(join(workDir, 'cached.txt'), 'cached');
    api = await startApiServer((request) => {
      if (status !== 200) {
        return { status, json: { message: 'rejected' } };
      }
      return successResponse(request.url);
    });
  });

  afterEach(async () => {
    await api.close();
    await fs.remove(workDir);
  });

  function successResponse(url: string) {
    if (url === '/v1/runs') {
      return {
        status: 200,
        json: { runId: 'run', groupId: 'group', runUrl: `${api.url}/run` },
      };
    }
    if (url === '/v1/runs/cancel') {
      return {
        status: 200,
        json: { status: 'OK', data: { runId: 'run', cancellation: null } },
      };
    }
    if (url === '/cache/upload') {
      return {
        status: 200,
        json: {
          cacheId: 'cache-1',
          orgId: 'org',
          uploadUrl: `${api.url}/put/archive`,
          metaUploadUrl: `${api.url}/put/meta`,
          refMetaUploadUrl: `${api.url}/put/ref-meta`,
          cacheKey: 'cache-key',
          metaCacheKey: 'meta-cache-key',
        },
      };
    }
    return { status: 200 };
  }

  function run(args: string[], env: Record<string, string> = {}) {
    return runCli(args, {
      cwd: workDir,
      env: { CURRENTS_API_URL: api.url, ...env },
    });
  }

  const commands: Record<string, string[]> = {
    'run upload': [
      'run',
      'upload',
      ...credentials,
      '--ci-build-id',
      'build',
      '--report-dir',
      'report',
    ],
    'run cancel': ['run', 'cancel', ...credentials, '--ci-build-id', 'build'],
    'cache get': ['cache', 'get', '--key', 'record-key', '--id', 'cache-1'],
    'cache set': [
      'cache',
      'set',
      '--key',
      'record-key',
      '--id',
      'cache-1',
      '--path',
      'cached.txt',
    ],
  };

  describe.each([
    [401, 'Unauthorized'],
    [404, 'Not Found'],
    [500, 'Unexpected network response'],
  ])('when the API answers %d', (httpStatus, warning) => {
    it.each(Object.keys(commands))('%s exits with 1', async (name) => {
      status = httpStatus;

      const result = await run(commands[name]);

      expect(result.code).toBe(1);
      expect(result.stderr).toContain(
        `Request failed with status code ${httpStatus}`
      );
      expect(result.stdout).toContain(warning);
    });
  });

  it('names the request of a 401 without a stray brace', async () => {
    status = 401;

    const { stdout } = await run(commands['run cancel']);

    expect(stdout).toContain('post v1/runs/cancel - 401 Unauthorized');
  });

  it('does not repeat a request that failed with 500', async () => {
    status = 500;

    await run(commands['run cancel']);

    expect(api.requests.map((request) => request.url)).toEqual([
      '/v1/runs/cancel',
    ]);
  });

  describe('when the run is accepted', () => {
    it.each(['run upload', 'run cancel', 'cache set'])(
      '%s exits with 0',
      async (name) => {
        const result = await run(commands[name]);

        expect(result.code).toBe(0);
        expect(result.stderr).toBe('');
      }
    );
  });

  it('runs the hidden upload command like run upload', async () => {
    const result = await run(['upload', ...commands['run upload'].slice(2)]);

    expect(result.code).toBe(0);
    expect(result.stderr).toBe('');
    expect(api.requests.map((request) => request.url)).toContain('/v1/runs');
  });

  it('runs the deprecated cancel command and warns on stderr', async () => {
    const result = await run(['cancel', ...credentials, '--ci-build-id', 'b']);

    expect(result.code).toBe(0);
    expect(result.stderr).toBe(
      "'currents cancel' is deprecated and will be removed in a future version. Use 'currents run cancel'.\n"
    );
    expect(api.requests.map((request) => request.url)).toEqual([
      '/v1/runs/cancel',
    ]);
  });

  it('reports a cancelled run that does not exist as a success', async () => {
    api.requests.length = 0;
    await api.close();
    api = await startApiServer(() => ({
      status: 200,
      json: { status: 'OK', data: { runId: null, cancellation: null } },
    }));

    const result = await run(commands['run cancel']);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain('No run to cancel');
  });

  describe('when the arguments are not valid', () => {
    const expectFailure = (result: CliResult, message: string) => {
      expect(result.code).toBe(1);
      expect(result.stderr).toContain(message);
      expect(api.requests).toEqual([]);
    };

    it('exits with 1 for an unknown command', async () => {
      expectFailure(await run(['unknown']), "unknown command 'unknown'");
    });

    it('exits with 1 for a preset that does not exist', async () => {
      expectFailure(
        await run(['cache', 'get', '--key', 'k', '--preset', 'nothing']),
        "argument 'nothing' is invalid"
      );
    });

    it('exits with 1 for a matrix index that is not a number', async () => {
      expectFailure(
        await run(['cache', 'get', '--key', 'k', '--matrix-index', 'x']),
        'A positive integer is expected'
      );
    });

    it.each([
      [
        'run upload',
        ['run', 'upload', '--project-id', 'project'],
        'Record key',
      ],
      ['run upload', ['run', 'upload', '--key', 'record-key'], 'Project ID'],
      [
        'run cancel',
        ['run', 'cancel', ...credentials],
        'Run ID or CI build ID',
      ],
      ['cache get', ['cache', 'get'], 'Record key'],
      ['cache set', ['cache', 'set'], 'Record key'],
      ['run get', ['run', 'get'], 'API key'],
    ])(
      'exits with 1 when %s misses a required value (%j)',
      async (_name, args, missing) => {
        const result = await run(args);

        expect(result.code).toBe(1);
        expect(result.stderr).toContain(`${missing} is required`);
        expect(api.requests).toEqual([]);
      }
    );

    it('exits with 1 when the report directory does not exist', async () => {
      const result = await run([
        'run',
        'upload',
        ...credentials,
        '--report-dir',
        'missing',
      ]);

      expect(result.code).toBe(1);
      expect(api.requests).toEqual([]);
    });

    it('exits with 1 when cache set finds no files', async () => {
      const result = await run([
        'cache',
        'set',
        '--key',
        'record-key',
        '--path',
        'nothing/*.txt',
      ]);

      expect(result.code).toBe(1);
      expect(result.stderr).toContain('No files available to upload');
    });

    it('exits with 0 when cache set finds no files and --continue is set', async () => {
      const result = await run([
        'cache',
        'set',
        '--key',
        'record-key',
        '--path',
        'nothing/*.txt',
        '--continue',
      ]);

      expect(result.code).toBe(0);
      expect(result.stdout).toContain('No files available to upload');
    });
  });
});
