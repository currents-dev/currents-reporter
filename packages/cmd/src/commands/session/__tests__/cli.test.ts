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

describe('session and run attach with the built CLI', () => {
  let api: ApiServer;
  let workDir: string;
  // Paths of the PUT requests whose upload the fake storage refuses.
  let refusedUploads: string[];
  let apiStatus: number | undefined;

  beforeEach(async () => {
    refusedUploads = [];
    apiStatus = undefined;
    workDir = await fs.mkdtemp(join(os.tmpdir(), 'currents-session-'));
    api = await startApiServer(respond);
  });

  afterEach(async () => {
    await api.close();
    await fs.remove(workDir);
  });

  // Answers as CONTRACT.md describes, with upload URLs that point back here.
  function respond(request: RecordedRequest) {
    const { method, url, json } = request;

    if (method === 'PUT') {
      return refusedUploads.some((name) => url.endsWith(name))
        ? { status: 403, body: '<Error><Code>AccessDenied</Code></Error>' }
        : { status: 200 };
    }
    if (apiStatus !== undefined) {
      return {
        status: apiStatus,
        json: { status: 'FAILED', error: 'rejected' },
      };
    }
    if (url === '/v1/sessions') {
      return {
        status: 200,
        json: { status: 'OK', data: { sessionId: 'sess1', attachments: [] } },
      };
    }
    if (
      url === '/v1/sessions/sess1/attachments' ||
      url === '/v1/sessions/other/attachments' ||
      url === '/v1/runs/attachments'
    ) {
      return {
        status: 200,
        json: {
          status: 'OK',
          data: {
            uploadExpiresInSeconds: 600,
            attachments: json.attachments.map(
              (file: { name: string; contentType: string }, index: number) => ({
                attachmentId: `a${index}`,
                name: file.name,
                type: 'attachment',
                uploadUrl: `${api.url}/upload/${file.name}`,
                uploadHeaders: { 'Content-Type': file.contentType },
              })
            ),
          },
        },
      };
    }
    if (url === '/v1/share') {
      return {
        status: 200,
        json: {
          status: 'OK',
          data: {
            purpose: 'report',
            url: 'https://share.example.com/x.md',
            pageUrl: 'https://share.example.com/x',
            expiresAt: '2026-10-09T00:00:00Z',
          },
        },
      };
    }
    return { status: 404, json: { status: 'FAILED', error: 'Not found' } };
  }

  const run = (args: string[], env: Record<string, string> = {}) =>
    runCli(args, {
      cwd: workDir,
      env: { CURRENTS_REST_API_URL: api.url, ...env },
    });

  const start = (...extra: string[]) =>
    run([
      'session',
      'start',
      '--api-key',
      'api-key',
      '-p',
      'project',
      '--title',
      'Checkout fails',
      ...extra,
    ]);

  const posts = () =>
    api.requests.filter((request) => request.method === 'POST');
  const uploads = () =>
    api.requests.filter((request) => request.method === 'PUT');
  const statePath = () => join(workDir, '.currents-session/session.json');

  describe('session start', () => {
    it('prints only the session ID as JSON with --json, and saves it', async () => {
      const result = await start(
        '--status',
        'failed',
        '--error',
        'boom',
        '--tag',
        'a,b',
        '--pr',
        '7',
        '--json'
      );

      expect(result.code).toBe(0);
      expect(result.stderr).toBe('');
      expect(JSON.parse(result.stdout)).toEqual({ sessionId: 'sess1' });
      expect(result.stdout.trim().split('\n')).toHaveLength(1);
      expect(await fs.readJson(statePath())).toEqual({
        sessionId: 'sess1',
        projectId: 'project',
      });
    });

    it('sends the session as the API contract describes', async () => {
      await start(
        '--status',
        'failed',
        '--error',
        'boom',
        '--tag',
        'a,b',
        '--pr',
        '7'
      );

      const [request] = posts();
      expect(request.url).toBe('/v1/sessions');
      expect(request.headers.authorization).toBe('Bearer api-key');
      expect(request.json).toMatchObject({
        projectId: 'project',
        title: 'Checkout fails',
        status: 'failed',
        error: 'boom',
        tags: ['a', 'b'],
        pr: { id: '7' },
        ci: { provider: null },
      });
      expect(request.json).not.toHaveProperty('ciBuildId');
    });

    it('sends a record key in x-currents-key, and it wins over an API key', async () => {
      const result = await run([
        'session',
        'start',
        '--key',
        'record-key',
        '-p',
        'project',
        '--title',
        't',
      ]);
      await start('--key', 'record-key');

      expect(result.code).toBe(0);
      for (const request of posts()) {
        expect(request.headers['x-currents-key']).toBe('record-key');
        expect(request.headers.authorization).toBeUndefined();
      }
    });

    it('takes the record key from CURRENTS_RECORD_KEY', async () => {
      await run(['session', 'start', '-p', 'project', '--title', 't'], {
        CURRENTS_RECORD_KEY: 'record-key',
      });

      expect(posts()[0].headers['x-currents-key']).toBe('record-key');
    });

    it('sends the pull request link as a link', async () => {
      await start('--pr', 'https://github.com/org/repo/pull/12');

      expect(posts()[0].json.pr).toEqual({
        link: 'https://github.com/org/repo/pull/12',
      });
    });

    it('prints the session ID for a person without --json', async () => {
      const result = await start();

      expect(result.code).toBe(0);
      expect(result.stdout).toContain('Session started: sess1');
    });

    it('sends the CI provider data', async () => {
      await start('--json');
      const withoutCI = posts()[0].json.ci;
      api.requests.length = 0;

      await run(
        ['session', 'start', '--api-key', 'k', '-p', 'project', '--title', 't'],
        {
          GITHUB_ACTIONS: 'true',
          GITHUB_RUN_ID: '100',
        }
      );

      expect(withoutCI.provider).toBeNull();
      expect(posts()[0].json.ci).toMatchObject({
        provider: 'githubActions',
        params: { githubRunId: '100' },
      });
    });

    it.each([
      [
        'no credential',
        ['session', 'start', '-p', 'project', '--title', 't'],
        'Record key or API key is required',
      ],
      [
        'no project ID',
        ['session', 'start', '--api-key', 'k', '--title', 't'],
        'Project ID is required',
      ],
      [
        'no title',
        ['session', 'start', '--api-key', 'k', '-p', 'project'],
        'Title is required',
      ],
      [
        'an unknown status',
        [
          'session',
          'start',
          '--api-key',
          'k',
          '-p',
          'project',
          '--title',
          't',
          '--status',
          'broken',
        ],
        "argument 'broken' is invalid",
      ],
    ])(
      'exits with 1 and sends nothing with %s',
      async (_name, args, message) => {
        const result = await run(args);

        expect(result.code).toBe(1);
        expect(result.stderr).toContain(message);
        expect(api.requests).toEqual([]);
      }
    );

    it.each([401, 404, 500])(
      'exits with 1 when the API answers %d',
      async (status) => {
        apiStatus = status;

        const result = await start('--json');

        expect(result.code).toBe(1);
        expect(result.stdout).toBe('');
        expect(result.stderr).toContain(`${status}`);
        expect(await fs.pathExists(statePath())).toBe(false);
      }
    );
  });

  describe('session attach', () => {
    const attach = (...args: string[]) =>
      run(['session', 'attach', '--api-key', 'api-key', ...args]);

    beforeEach(async () => {
      await fs.writeFile(join(workDir, 'before.png'), 'png-bytes');
    });

    it('declares and uploads a file to the saved session', async () => {
      await start('--json');
      api.requests.length = 0;

      const result = await attach(
        '--caption',
        'before',
        '--meta',
        'step=1',
        'before.png'
      );

      expect(result.code).toBe(0);
      const [declare] = posts();
      expect(declare.url).toBe('/v1/sessions/sess1/attachments');
      expect(declare.headers.authorization).toBe('Bearer api-key');
      expect(declare.json).toEqual({
        attachments: [
          {
            name: 'before.png',
            type: 'screenshot',
            contentType: 'image/png',
            sizeBytes: 9,
            caption: 'before',
            meta: { step: '1' },
          },
        ],
      });
      expect(uploads()).toHaveLength(1);
      expect(uploads()[0].url).toBe('/upload/before.png');
      expect(uploads()[0].body.toString()).toBe('png-bytes');
      expect(uploads()[0].headers['content-type']).toBe('image/png');
    });

    it('declares files with a record key', async () => {
      await start('--json');
      api.requests.length = 0;

      const result = await run([
        'session',
        'attach',
        '--key',
        'record-key',
        'before.png',
      ]);

      expect(result.code).toBe(0);
      expect(posts()[0].headers['x-currents-key']).toBe('record-key');
      expect(posts()[0].headers.authorization).toBeUndefined();
    });

    it('exits with 1 and sends nothing without a credential', async () => {
      await start('--json');
      api.requests.length = 0;

      const result = await run(['session', 'attach', 'before.png']);

      expect(result.code).toBe(1);
      expect(result.stderr).toContain('Record key or API key is required');
      expect(api.requests).toEqual([]);
    });

    it('uses --session-id instead of the saved session', async () => {
      await start('--json');
      api.requests.length = 0;

      const result = await attach('--session-id', 'other', 'before.png');

      expect(result.code).toBe(0);
      expect(posts()[0].url).toBe('/v1/sessions/other/attachments');
    });

    it('exits with 1 when there is no session', async () => {
      const result = await attach('before.png');

      expect(result.code).toBe(1);
      expect(result.stderr).toContain('No session found');
      expect(api.requests).toEqual([]);
    });

    it('exits with 1 and names the file whose upload was refused', async () => {
      await start('--json');
      await fs.writeFile(join(workDir, 'bad.txt'), 'x');
      refusedUploads.push('bad.txt');
      api.requests.length = 0;

      const result = await attach('before.png', 'bad.txt');

      expect(result.code).toBe(1);
      expect(result.stderr).toContain('Failed bad.txt');
      expect(result.stderr).toContain('1 of 2 files could not be uploaded');
      expect(
        uploads()
          .map((request) => request.url)
          .sort()
      ).toEqual(['/upload/bad.txt', '/upload/before.png']);
    });

    it('exits with 1 for a path that does not exist', async () => {
      await start('--json');
      api.requests.length = 0;

      const result = await attach('missing.png');

      expect(result.code).toBe(1);
      expect(uploads()).toEqual([]);
    });
  });

  describe('session share', () => {
    const share = (...args: string[]) =>
      run(['session', 'share', '--api-key', 'api-key', ...args]);

    it('prints the page link and the markdown link for the saved session', async () => {
      await start('--json');
      api.requests.length = 0;

      const result = await share('--expires-in-days', '7');

      expect(result.code).toBe(0);
      expect(result.stdout.split('\n')[0]).toBe('https://share.example.com/x');
      expect(result.stdout).toContain(
        'Markdown: https://share.example.com/x.md'
      );
      expect(posts()[0].url).toBe('/v1/share');
      expect(posts()[0].json).toEqual({
        sessionId: 'sess1',
        purpose: 'report',
        expiresInDays: 7,
      });
    });

    it('shares with a record key', async () => {
      await start('--json');
      api.requests.length = 0;

      const result = await run(['session', 'share', '--key', 'record-key']);

      expect(result.code).toBe(0);
      expect(posts()[0].url).toBe('/v1/share');
      expect(posts()[0].headers['x-currents-key']).toBe('record-key');
      expect(posts()[0].headers.authorization).toBeUndefined();
    });

    it('exits with 1 for a number of days the API does not take', async () => {
      await start('--json');

      const result = await share('--expires-in-days', '5');

      expect(result.code).toBe(1);
      expect(result.stderr).toContain("argument '5' is invalid");
    });

    it('exits with 1 when there is no session', async () => {
      const result = await share();

      expect(result.code).toBe(1);
      expect(result.stderr).toContain('No session found');
    });
  });

  describe('run attach', () => {
    const attach = (args: string[], env: Record<string, string> = {}) =>
      run(['run', 'attach', '-p', 'project', ...args], env);

    beforeEach(async () => {
      await fs.writeFile(join(workDir, 'docker.zip'), 'zip-bytes');
    });

    it('declares run-level files with a record key and a machine ID', async () => {
      const result = await attach([
        '--key',
        'record-key',
        '--ci-build-id',
        'build-1',
        '--machine-id',
        'shard-1',
        'docker.zip',
      ]);

      expect(result.code).toBe(0);
      const [declare] = posts();
      expect(declare.url).toBe('/v1/runs/attachments');
      expect(declare.headers['x-currents-key']).toBe('record-key');
      expect(declare.headers.authorization).toBeUndefined();
      expect(declare.json).toEqual({
        projectId: 'project',
        ciBuildId: 'build-1',
        machineId: 'shard-1',
        attachments: [
          {
            name: 'docker.zip',
            type: 'attachment',
            contentType: 'application/zip',
            sizeBytes: 9,
          },
        ],
      });
      expect(uploads()[0].body.toString()).toBe('zip-bytes');
    });

    it('declares run-level files without a machine ID', async () => {
      const result = await attach([
        '--key',
        'record-key',
        '--ci-build-id',
        'build-1',
        'docker.zip',
      ]);

      expect(result.code).toBe(0);
      expect(posts()[0].json).not.toHaveProperty('machineId');
    });

    it('sends an API key as a bearer token', async () => {
      await attach([
        '--api-key',
        'api-key',
        '--ci-build-id',
        'build-1',
        '--machine-id',
        'm',
        'docker.zip',
      ]);

      expect(posts()[0].headers.authorization).toBe('Bearer api-key');
      expect(posts()[0].headers['x-currents-key']).toBeUndefined();
    });

    it('targets a test of a spec file and leaves the machine ID out', async () => {
      await attach([
        '--key',
        'record-key',
        '--ci-build-id',
        'build-1',
        '--machine-id',
        'm',
        '--spec',
        'tests/cart.spec.ts',
        '--test-title',
        'adds an item',
        '--group',
        'chromium',
        '--attempt',
        '1',
        'docker.zip',
      ]);

      const body = posts()[0].json;
      expect(body).toMatchObject({
        spec: 'tests/cart.spec.ts',
        testTitle: 'adds an item',
        groupId: 'chromium',
        attempt: 1,
      });
      expect(body).not.toHaveProperty('machineId');
    });

    it('lets the API find the run from the CI data when the provider is detected', async () => {
      const result = await attach(
        ['--key', 'record-key', '--machine-id', 'm', 'docker.zip'],
        {
          GITHUB_ACTIONS: 'true',
          GITHUB_RUN_ID: '100',
        }
      );

      expect(result.code).toBe(0);
      const body = posts()[0].json;
      expect(body).not.toHaveProperty('ciBuildId');
      expect(body.ci).toMatchObject({
        provider: 'githubActions',
        params: { githubRunId: '100' },
      });
    });

    it.each([
      [
        'no credential',
        ['--ci-build-id', 'b', '--machine-id', 'm', 'docker.zip'],
        'Record key or API key is required',
      ],
      ['no project ID', null, 'Project ID is required'],
      [
        'no CI build ID outside a known CI provider',
        ['--key', 'k', '--machine-id', 'm', 'docker.zip'],
        'The CI build ID is unknown',
      ],
    ])(
      'exits with 1 and sends nothing with %s',
      async (_name, args, message) => {
        const result =
          args === null
            ? await run([
                'run',
                'attach',
                '--key',
                'k',
                '--ci-build-id',
                'b',
                '--machine-id',
                'm',
                'docker.zip',
              ])
            : await attach(args);

        expect(result.code).toBe(1);
        expect(result.stderr).toContain(message);
        expect(api.requests).toEqual([]);
      }
    );

    it.each([401, 404, 500])(
      'exits with 1 when the API answers %d',
      async (status) => {
        apiStatus = status;

        const result = await attach([
          '--key',
          'k',
          '--ci-build-id',
          'b',
          '--machine-id',
          'm',
          'docker.zip',
        ]);

        expect(result.code).toBe(1);
        expect(result.stderr).toContain(`${status}`);
      }
    );
  });
});
