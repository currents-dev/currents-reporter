import fs from 'fs-extra';
import os from 'os';
import { join } from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ApiServer, startApiServer } from '../../test-utils/api-server';
import { runCli } from '../../test-utils/cli';

describe('currents run get with the built CLI', () => {
  let api: ApiServer;
  let status: number;
  let workDir: string;

  beforeEach(async () => {
    status = 200;
    workDir = await fs.mkdtemp(join(os.tmpdir(), 'currents-api-'));
    api = await startApiServer(() => ({
      status,
      json: {
        status: 'OK',
        data: {
          runId: 'run-1',
          pwLastRun: { status: 'failed', failedTests: ['t1'] },
        },
      },
    }));
  });

  afterEach(async () => {
    await api.close();
    await fs.remove(workDir);
  });

  const getRun = (args: string[], command = ['run', 'get']) =>
    runCli([...command, '--api-key', 'api-key', '-p', 'project', ...args], {
      cwd: workDir,
      env: { CURRENTS_REST_API_URL: api.url },
    });

  it('prints the run and sends the key as a bearer token', async () => {
    const result = await getRun(['--ci-build-id', 'build']);

    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout).runId).toBe('run-1');
    expect(api.requests).toHaveLength(1);
    expect(api.requests[0].headers.authorization).toBe('Bearer api-key');
    expect(api.requests[0].url).toBe(
      '/v1/runs/find?projectId=project&ciBuildId=build'
    );
  });

  it('prints the same run with the hidden api get-run command', async () => {
    const current = await getRun(['--ci-build-id', 'build']);
    const legacy = await getRun(['--ci-build-id', 'build'], ['api', 'get-run']);

    expect(legacy.code).toBe(0);
    expect(legacy.stdout).toBe(current.stdout);
    expect(api.requests[1].url).toBe(api.requests[0].url);
  });

  it('looks the run up by branch and tags', async () => {
    await getRun(['--branch', 'main', '--tag', 'a,b']);

    const url = new URL(api.requests[0].url, api.url);
    expect(url.searchParams.get('branch')).toBe('main');
    expect(url.searchParams.getAll('tag[]')).toEqual(['a', 'b']);
    expect(url.searchParams.has('ciBuildId')).toBe(false);
  });

  it('writes only the last run data to --output with --pw-last-run', async () => {
    const output = join(workDir, 'nested/last-run.json');

    const result = await getRun([
      '--ci-build-id',
      'build',
      '--pw-last-run',
      '--output',
      output,
    ]);

    expect(result.code).toBe(0);
    expect(await fs.readJson(output)).toEqual({
      status: 'failed',
      failedTests: ['t1'],
    });
  });

  it('exits with 1 when the API answers 401', async () => {
    status = 401;

    const result = await getRun(['--ci-build-id', 'build']);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain('status code 401');
  });

  it('exits with 1 without a request when no run filter is given', async () => {
    const result = await getRun([]);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain('Missing or invalid parameters');
    expect(api.requests).toEqual([]);
  });
});
