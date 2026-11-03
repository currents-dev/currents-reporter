import fs from 'fs-extra';
import os from 'os';
import { join } from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  ApiServer,
  RecordedRequest,
  startApiServer,
} from '../../../test-utils/api-server';
import { runCli } from '../../../test-utils/cli';

describe('run share with the built CLI', () => {
  let api: ApiServer;
  let workDir: string;
  let shareStatus: number;

  beforeEach(async () => {
    shareStatus = 200;
    workDir = await fs.mkdtemp(join(os.tmpdir(), 'currents-run-share-'));
    api = await startApiServer(respond);
  });

  afterEach(async () => {
    await api.close();
    await fs.remove(workDir);
  });

  function respond({ method, url }: RecordedRequest) {
    if (method === 'GET' && url === '/v1/instances/inst1') {
      return {
        status: 200,
        json: { status: 'OK', data: { instanceId: 'inst1', runId: 'run1' } },
      };
    }
    if (method === 'POST' && url === '/v1/share') {
      if (shareStatus !== 200) {
        return {
          status: shareStatus,
          json: {
            status: 'FAILED',
            error: 'Public sharing is turned off',
            code: 'sharingDisabled',
          },
        };
      }
      return {
        status: 200,
        json: {
          status: 'OK',
          data: {
            purpose: 'report',
            url: 'https://share.example.com/x.md',
            pageUrl: 'https://share.example.com/x',
            expiresAt: '2026-11-09T00:00:00Z',
          },
        },
      };
    }
    return { status: 404, json: { status: 'FAILED', error: 'Not found' } };
  }

  const share = (args: string[], env: Record<string, string> = {}) =>
    runCli(['run', 'share', ...args], {
      cwd: workDir,
      env: {
        CURRENTS_REST_API_URL: api.url,
        CURRENTS_API_KEY: 'api-key',
        ...env,
      },
    });

  const sharePosts = () =>
    api.requests.filter(
      (request) => request.method === 'POST' && request.url === '/v1/share'
    );

  it('shares a whole run as a report and prints the page and markdown links', async () => {
    const result = await share(['run1']);

    expect(result.code).toBe(0);
    expect(result.stdout.split('\n').slice(0, 2)).toEqual([
      'https://share.example.com/x',
      'Markdown: https://share.example.com/x.md',
    ]);
    expect(api.requests).toHaveLength(1);
    expect(sharePosts()[0].headers.authorization).toBe('Bearer api-key');
    expect(sharePosts()[0].json).toEqual({ runId: 'run1', purpose: 'report' });
  });

  it('sends --purpose and --expires-in-days', async () => {
    const result = await share([
      'run1',
      '--purpose',
      'fix',
      '--expires-in-days',
      '3',
    ]);

    expect(result.code).toBe(0);
    expect(sharePosts()[0].json).toEqual({
      runId: 'run1',
      purpose: 'fix',
      expiresInDays: 3,
    });
  });

  it('shares a spec file with the run and the instance', async () => {
    const result = await share(['run1', '--instance-id', 'inst1']);

    expect(result.code).toBe(0);
    expect(api.requests).toHaveLength(1);
    expect(sharePosts()[0].json).toEqual({
      runId: 'run1',
      instanceId: 'inst1',
      purpose: 'report',
    });
  });

  it('checks the run of the instance, then shares a test', async () => {
    const result = await share([
      'run1',
      '--instance-id',
      'inst1',
      '--test-id',
      'test1',
      '--purpose',
      'fix',
      '--attempt',
      '0',
    ]);

    expect(result.code).toBe(0);
    expect(api.requests.map(({ method, url }) => `${method} ${url}`)).toEqual([
      'GET /v1/instances/inst1',
      'POST /v1/share',
    ]);
    expect(api.requests[0].headers.authorization).toBe('Bearer api-key');
    expect(sharePosts()[0].json).toEqual({
      instanceId: 'inst1',
      testId: 'test1',
      attempt: 0,
      purpose: 'fix',
    });
  });

  it('refuses a test of an instance from another run', async () => {
    const result = await share([
      'run2',
      '--instance-id',
      'inst1',
      '--test-id',
      'test1',
    ]);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain(
      'Instance inst1 belongs to run run1, not run run2'
    );
    expect(sharePosts()).toHaveLength(0);
  });

  it.each([
    [['--test-id', 't1'], '--test-id needs --instance-id'],
    [['--attempt', '0'], '--attempt needs --test-id'],
    [
      ['--instance-id', 'i1', '--test-id', 't1', '--attempt', '0'],
      '--attempt needs --purpose fix',
    ],
    [
      [
        '--instance-id',
        'i1',
        '--test-id',
        't1',
        '--purpose',
        'report',
        '--attempt',
        '1',
      ],
      '--attempt needs --purpose fix',
    ],
  ])('refuses %j before any request', async (args, message) => {
    const result = await share(['run1', ...args]);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain(message);
    expect(api.requests).toHaveLength(0);
  });

  it.each([
    [[' '], '<run-id> must not be empty'],
    [['run1', '--instance-id', ''], '--instance-id must not be empty'],
    [
      ['run1', '--instance-id', 'inst1', '--test-id', ' '],
      '--test-id must not be empty',
    ],
  ])('refuses the empty id in %j before any request', async (args, message) => {
    const result = await share(args);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain(message);
    expect(api.requests).toHaveLength(0);
  });

  it('refuses a record key without an API key', async () => {
    const result = await runCli(['run', 'share', 'run1'], {
      cwd: workDir,
      env: {
        CURRENTS_REST_API_URL: api.url,
        CURRENTS_RECORD_KEY: 'record-key',
      },
    });

    expect(result.code).toBe(1);
    expect(result.stderr).toContain(
      'run share needs an API key (--api-key or CURRENTS_API_KEY). A record key can share only sessions.'
    );
    expect(api.requests).toHaveLength(0);
  });

  it('exits with 1 and the API message when the API refuses', async () => {
    shareStatus = 403;

    const result = await share(['run1']);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain(
      '403 sharingDisabled: Public sharing is turned off'
    );
  });

  it('refuses a number of days the API does not take', async () => {
    const result = await share(['run1', '--expires-in-days', '5']);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("argument '5' is invalid");
    expect(api.requests).toHaveLength(0);
  });
});
