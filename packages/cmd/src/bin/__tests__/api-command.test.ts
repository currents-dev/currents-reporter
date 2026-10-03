import fs from 'fs-extra';
import os from 'os';
import { join } from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ApiServer, startApiServer } from '../../test-utils/api-server';
import { runCli } from '../../test-utils/cli';

describe('currents api with the built CLI', () => {
  let api: ApiServer;
  let workDir: string;
  const body = { status: 'OK', data: { runId: 'run-1' } };

  beforeEach(async () => {
    workDir = await fs.mkdtemp(join(os.tmpdir(), 'currents-api-'));
    api = await startApiServer((request) =>
      request.url.startsWith('/v1/runs/missing')
        ? { status: 404, json: { status: 'FAILED', message: 'Not found' } }
        : { status: 200, json: body }
    );
  });

  afterEach(async () => {
    await api.close();
    await fs.remove(workDir);
  });

  const runApi = (args: string[], env: Record<string, string> = {}) =>
    runCli(['api', ...args], {
      cwd: workDir,
      env: { CURRENTS_REST_API_URL: api.url, ...env },
    });

  it('prints the body of the response on stdout', async () => {
    const result = await runApi(['/v1/runs/run-1', '--api-key', 'api-key']);

    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual(body);
    expect(result.stderr).toBe('');
    expect(api.requests[0]).toMatchObject({
      method: 'GET',
      url: '/v1/runs/run-1',
    });
    expect(api.requests[0].headers.authorization).toBe('Bearer api-key');
  });

  it('takes the key from CURRENTS_API_KEY, and --api-key wins over it', async () => {
    await runApi(['runs/run-1'], { CURRENTS_API_KEY: 'env-key' });
    await runApi(['runs/run-1', '--api-key', 'cli-key'], {
      CURRENTS_API_KEY: 'env-key',
    });

    expect(api.requests.map((r) => r.headers.authorization)).toEqual([
      'Bearer env-key',
      'Bearer cli-key',
    ]);
  });

  it('sends fields as a JSON body with -X PUT', async () => {
    const result = await runApi(
      ['/v1/runs/run-1/reset', '-X', 'PUT', '-f', 'machineId[]=m1'],
      { CURRENTS_API_KEY: 'api-key' }
    );

    expect(result.code).toBe(0);
    expect(api.requests[0].method).toBe('PUT');
    expect(api.requests[0].json).toEqual({ machineId: ['m1'] });
  });

  it('prints the body of a 404 on stderr and exits with 1', async () => {
    const result = await runApi(['/v1/runs/missing'], {
      CURRENTS_API_KEY: 'api-key',
    });

    expect(result.code).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('"message":"Not found"');
    expect(result.stderr).toContain('the REST API answered 404 Not Found');
  });
});
