import fs from 'fs-extra';
import os from 'os';
import { join } from 'path';
import unzipper from 'unzipper';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  ApiServer,
  RecordedRequest,
  startApiServer,
} from '../../../test-utils/api-server';
import { runCli } from '../../../test-utils/cli';

const key = ['--key', 'record-key'];

/**
 * Stands in for the cache endpoints of the API and for the storage the
 * returned URLs point to. Uploads are kept in memory and served back.
 */
class FakeCache {
  server!: ApiServer;
  stored = new Map<string, Buffer>();
  // Set to a status to make reading the reference meta file fail with it.
  readMetaStatus = 200;

  async start() {
    this.server = await startApiServer((request) => this.respond(request));
  }

  get requests() {
    return this.server.requests;
  }

  requestsTo(url: string) {
    return this.requests.filter((request) => request.url === url);
  }

  private respond(request: RecordedRequest) {
    const { url, method } = request;
    const base = this.server.url;

    if (method === 'POST' && url === '/cache/upload') {
      return {
        status: 200,
        json: {
          cacheId: 'cache-1',
          orgId: 'org-1',
          uploadUrl: `${base}/storage/archive`,
          metaUploadUrl: `${base}/storage/meta`,
          refMetaUploadUrl: `${base}/storage/ref-meta`,
          cacheKey: 'cache-key-1',
          metaCacheKey: 'meta-key-1',
        },
      };
    }
    if (method === 'PUT' && url.startsWith('/storage/')) {
      this.stored.set(url, request.body);
      return { status: 200 };
    }
    if (method === 'POST' && url === '/cache/meta') {
      return {
        status: 200,
        json: {
          cacheId: 'cache-1',
          orgId: 'org-1',
          refMetaReadUrl: `${base}/storage/ref-meta`,
        },
      };
    }
    if (method === 'POST' && url === '/cache/v2/download') {
      return {
        status: 200,
        json: { orgId: 'org-1', readUrl: `${base}/storage/archive` },
      };
    }
    if (
      method === 'GET' &&
      url === '/storage/ref-meta' &&
      this.readMetaStatus !== 200
    ) {
      return { status: this.readMetaStatus };
    }
    if (method === 'GET' && this.stored.has(url)) {
      return { status: 200, body: this.stored.get(url) };
    }
    return { status: 404 };
  }

  get archive() {
    return this.stored.get('/storage/archive');
  }

  get refMeta() {
    return JSON.parse(this.stored.get('/storage/ref-meta')!.toString());
  }
}

async function archiveFiles(archive: Buffer) {
  const directory = await unzipper.Open.buffer(archive);
  return directory.files
    .filter((file) => file.type === 'File')
    .map((file) => file.path)
    .sort();
}

describe('currents cache with the built CLI', () => {
  let cache: FakeCache;
  let setDir: string;
  let getDir: string;

  beforeEach(async () => {
    cache = new FakeCache();
    await cache.start();
    setDir = await fs.mkdtemp(join(os.tmpdir(), 'currents-cache-set-'));
    getDir = await fs.mkdtemp(join(os.tmpdir(), 'currents-cache-get-'));
  });

  afterEach(async () => {
    await cache.server.close();
    await fs.remove(setDir);
    await fs.remove(getDir);
  });

  const set = (args: string[], env: Record<string, string> = {}) =>
    runCli(['cache', 'set', ...key, ...args], {
      cwd: setDir,
      env: { CURRENTS_API_URL: cache.server.url, ...env },
    });

  const get = (args: string[], env: Record<string, string> = {}) =>
    runCli(['cache', 'get', ...key, ...args], {
      cwd: getDir,
      env: { CURRENTS_API_URL: cache.server.url, ...env },
    });

  async function writeTestResults() {
    await fs.outputFile(
      join(setDir, 'test-results/.last-run.json'),
      '{"status":"failed"}'
    );
    await fs.outputFile(
      join(setDir, 'test-results/a/.last-run.json'),
      '{"status":"passed"}'
    );
    await fs.outputFile(join(setDir, 'test-results/trace.zip'), 'trace');
    await fs.outputFile(join(setDir, 'other/file.txt'), 'other');
  }

  describe('cache set --preset last-run', () => {
    it('archives only the .last-run.json files of the Playwright output directory', async () => {
      await writeTestResults();

      const result = await set(['--preset', 'last-run']);

      expect(result.code).toBe(0);
      expect(await archiveFiles(cache.archive!)).toEqual([
        'test-results/.last-run.json',
        'test-results/a/.last-run.json',
      ]);
    });

    it('reads the files from --pw-output-dir', async () => {
      await fs.outputFile(join(setDir, 'out/.last-run.json'), '{}');
      await fs.outputFile(join(setDir, 'test-results/.last-run.json'), '{}');

      await set(['--preset', 'last-run', '--pw-output-dir', 'out']);

      expect(await archiveFiles(cache.archive!)).toEqual([
        'out/.last-run.json',
      ]);
    });

    it('adds the files of --path to the archive', async () => {
      await writeTestResults();

      await set(['--preset', 'last-run', '--path', 'other/*.txt']);

      expect(await archiveFiles(cache.archive!)).toEqual([
        'other/file.txt',
        'test-results/.last-run.json',
        'test-results/a/.last-run.json',
      ]);
    });

    it('asks for a cache with the matrix position and CI data, without the record key in the meta', async () => {
      await writeTestResults();

      await set(
        [
          '--preset',
          'last-run',
          '--id',
          'my-id',
          '--matrix-index',
          '2',
          '--matrix-total',
          '3',
        ],
        {
          GITHUB_ACTIONS: 'true',
          GITHUB_RUN_ID: '100',
          GITHUB_RUN_ATTEMPT: '1',
        }
      );

      const [createRequest] = cache.requestsTo('/cache/upload');
      expect(createRequest.json).toMatchObject({
        recordKey: 'record-key',
        id: 'my-id',
        config: { matrixIndex: 2, matrixTotal: 3 },
        ci: {
          provider: 'githubActions',
          params: { githubRunId: '100', githubRunAttempt: '1' },
        },
      });
      expect(cache.refMeta).toMatchObject({
        id: 'cache-1',
        orgId: 'org-1',
        cacheKey: 'cache-key-1',
        metaCacheKey: 'meta-key-1',
        path: [
          join(setDir, 'test-results/.last-run.json'),
          join(setDir, 'test-results/a/.last-run.json'),
        ].map((p) => fs.realpathSync(p)),
        config: {
          preset: 'last-run',
          id: 'my-id',
          matrixIndex: 2,
          matrixTotal: 3,
        },
      });
      expect(cache.refMeta.config).not.toHaveProperty('recordKey');
    });

    it('fails when the output directory has no .last-run.json', async () => {
      const result = await set(['--preset', 'last-run']);

      expect(result.code).toBe(1);
      expect(result.stderr).toContain('No files available to upload');
      expect(cache.requestsTo('/cache/upload')).toHaveLength(0);
    });
  });

  describe('cache get', () => {
    async function setLastRun(env: Record<string, string> = {}) {
      await writeTestResults();
      const result = await set(['--preset', 'last-run'], env);
      expect(result.code).toBe(0);
    }

    it('restores the files of the cache into the working directory', async () => {
      await setLastRun();

      const result = await get(['--preset', 'last-run']);

      expect(result.code).toBe(0);
      expect(
        await fs.readFile(join(getDir, 'test-results/.last-run.json'), 'utf8')
      ).toBe('{"status":"failed"}');
      expect(
        await fs.pathExists(join(getDir, 'test-results/a/.last-run.json'))
      ).toBe(true);
      expect(await fs.pathExists(join(getDir, 'test-results/trace.zip'))).toBe(
        false
      );
    });

    it('restores into a relative --output-dir', async () => {
      await setLastRun();

      await get(['--preset', 'last-run', '--output-dir', 'restored']);

      expect(
        await fs.pathExists(
          join(getDir, 'restored/test-results/.last-run.json')
        )
      ).toBe(true);
      expect(await fs.pathExists(join(getDir, 'test-results'))).toBe(false);
    });

    it('restores into an absolute --output-dir', async () => {
      await setLastRun();
      const outputDir = join(getDir, 'absolute');

      await get(['--preset', 'last-run', '--output-dir', outputDir]);

      expect(
        await fs.pathExists(join(outputDir, 'test-results/.last-run.json'))
      ).toBe(true);
    });

    it('sends the id and the cache key it was given', async () => {
      await setLastRun();

      await get([
        '--id',
        'my-id',
        '--matrix-index',
        '2',
        '--matrix-total',
        '3',
      ]);

      expect(cache.requestsTo('/cache/meta')[0].json).toMatchObject({
        recordKey: 'record-key',
        id: 'my-id',
        config: { matrixIndex: 2, matrixTotal: 3 },
      });
      expect(cache.requestsTo('/cache/v2/download')[0].json).toEqual({
        recordKey: 'record-key',
        cacheKey: 'cache-key-1',
      });
    });

    it('does not write the preset output without --preset', async () => {
      await setLastRun();

      await get([], { GITHUB_ACTIONS: 'true' });

      expect(await fs.pathExists(join(getDir, '.currents_env'))).toBe(false);
    });

    describe('the Playwright flags written for the preset', () => {
      const readFlags = (path = '.currents_env') =>
        fs.readFile(join(getDir, path), 'utf8');

      it('writes no flags on the first attempt of an unsharded GitHub Actions run', async () => {
        await setLastRun({ GITHUB_ACTIONS: 'true', GITHUB_RUN_ATTEMPT: '1' });

        await get(['--preset', 'last-run'], {
          GITHUB_ACTIONS: 'true',
          GITHUB_RUN_ATTEMPT: '1',
        });

        expect(await readFlags()).toBe('');
      });

      it('writes the shard of the matrix job on the first attempt', async () => {
        await setLastRun({ GITHUB_ACTIONS: 'true', GITHUB_RUN_ATTEMPT: '1' });

        await get(
          [
            '--preset',
            'last-run',
            '--matrix-index',
            '2',
            '--matrix-total',
            '3',
          ],
          {
            GITHUB_ACTIONS: 'true',
            GITHUB_RUN_ATTEMPT: '1',
          }
        );

        expect(await readFlags()).toBe('--shard=2/3');
      });

      it('runs only the failed tests on a rerun when the earlier run saved .last-run.json', async () => {
        await setLastRun({ GITHUB_ACTIONS: 'true', GITHUB_RUN_ATTEMPT: '1' });

        await get(
          [
            '--preset',
            'last-run',
            '--matrix-index',
            '2',
            '--matrix-total',
            '3',
          ],
          {
            GITHUB_ACTIONS: 'true',
            GITHUB_RUN_ATTEMPT: '2',
          }
        );

        expect(await readFlags()).toBe('--last-failed --shard=1/1');
      });

      it('does not use --last-failed on a rerun when the earlier run saved no .last-run.json', async () => {
        await fs.outputFile(join(setDir, 'cached.txt'), 'x');
        await set(['--path', 'cached.txt']);

        await get(['--preset', 'last-run'], {
          GITHUB_ACTIONS: 'true',
          GITHUB_RUN_ATTEMPT: '2',
        });

        expect(await readFlags()).toBe('');
      });

      it('writes to --preset-output', async () => {
        await setLastRun({ GITHUB_ACTIONS: 'true' });

        await get(
          [
            '--preset',
            'last-run',
            '--preset-output',
            'flags.txt',
            '--matrix-total',
            '2',
          ],
          {
            GITHUB_ACTIONS: 'true',
          }
        );

        expect(await readFlags('flags.txt')).toBe('--shard=1/2');
        expect(await fs.pathExists(join(getDir, '.currents_env'))).toBe(false);
      });

      it('writes the variables for GitLab from the node index and total', async () => {
        const gitlab = {
          GITLAB_CI: 'true',
          CI_NODE_INDEX: '2',
          CI_NODE_TOTAL: '4',
        };
        await setLastRun(gitlab);

        await get(['--preset', 'last-run'], gitlab);

        expect(await readFlags()).toBe(
          'EXTRA_PW_FLAGS="--shard=2/4"\nEXTRA_PWCP_FLAGS=""\nRUN_ATTEMPT=1\n'
        );
      });

      it('counts the next attempt on GitLab from the RUN_ATTEMPT saved with the cache and uses --last-failed', async () => {
        const gitlab = {
          GITLAB_CI: 'true',
          CI_NODE_INDEX: '2',
          CI_NODE_TOTAL: '4',
        };
        await setLastRun({ ...gitlab, RUN_ATTEMPT: '1' });

        await get(['--preset', 'last-run'], gitlab);

        expect(await readFlags()).toBe(
          'EXTRA_PW_FLAGS="--last-failed --shard=1/1"\nEXTRA_PWCP_FLAGS="--last-failed"\nRUN_ATTEMPT=2\n'
        );
      });

      it('writes the shard from the Circle node index, which starts at 0', async () => {
        const circle = {
          CIRCLECI: 'true',
          CIRCLE_NODE_INDEX: '1',
          CIRCLE_NODE_TOTAL: '3',
          CIRCLE_WORKFLOW_ID: 'wf-1',
          CIRCLE_WORKFLOW_WORKSPACE_ID: 'ws-1',
        };
        await setLastRun(circle);

        await get(['--preset', 'last-run'], circle);

        // Same workflow as the saved cache, so this is not a rerun.
        expect(await readFlags()).toBe('--shard=2/3');
      });

      it('runs only the failed tests on a Circle rerun of the same workspace', async () => {
        const circle = {
          CIRCLECI: 'true',
          CIRCLE_NODE_INDEX: '1',
          CIRCLE_NODE_TOTAL: '3',
          CIRCLE_WORKFLOW_ID: 'wf-1',
          CIRCLE_WORKFLOW_WORKSPACE_ID: 'ws-1',
        };
        await setLastRun(circle);

        await get(['--preset', 'last-run'], {
          ...circle,
          CIRCLE_WORKFLOW_ID: 'wf-2',
        });

        expect(await readFlags()).toBe('--last-failed --shard=1/1');
      });

      it('writes nothing for a CI provider without preset support', async () => {
        await setLastRun({ BUILDKITE: 'true' });

        await get(['--preset', 'last-run'], { BUILDKITE: 'true' });

        expect(await fs.pathExists(join(getDir, '.currents_env'))).toBe(false);
      });
    });

    describe('when the cache is not there', () => {
      it('fails with the cache id in the message', async () => {
        await setLastRun();
        cache.readMetaStatus = 404;

        const result = await get([]);

        expect(result.code).toBe(1);
        expect(result.stderr).toContain('Cache with ID "cache-1" not found');
      });

      it('exits with 0 and a warning with --continue', async () => {
        await setLastRun();
        cache.readMetaStatus = 404;

        const result = await get(['--continue']);

        expect(result.code).toBe(0);
        expect(result.stdout).toContain('Cache with ID "cache-1" not found');
      });
    });
  });

  describe('the default cache ID', () => {
    const warning = 'No CI job detected: without --id the cache ID is random';

    it.each([
      ['set', () => set(['--path', 'other/*.txt'])],
      ['get', () => get([])],
    ])(
      'cache %s warns on stderr without --id outside a CI job',
      async (_name, command) => {
        await writeTestResults();

        const result = await command();

        expect(result.stderr).toContain(warning);
        expect(result.stdout).not.toContain(warning);
      }
    );

    it.each([
      ['set', () => set(['--path', 'other/*.txt', '--id', 'my-id'])],
      ['get', () => get(['--id', 'my-id'])],
      [
        'set on GitHub Actions',
        () =>
          set(['--path', 'other/*.txt'], {
            GITHUB_ACTIONS: 'true',
            GITHUB_RUN_ID: '100',
          }),
      ],
    ])('cache %s does not warn', async (_name, command) => {
      await writeTestResults();

      const result = await command();

      expect(result.stderr + result.stdout).not.toContain(warning);
    });
  });

  it('does not save a --path outside the current folder', async () => {
    await writeTestResults();
    await fs.outputFile(join(setDir, '../outside-cache-test.txt'), 'secret');

    const result = await set([
      '--id',
      'my-id',
      '--path',
      'other/*.txt,../outside-cache-test.txt',
    ]);

    await fs.remove(join(setDir, '../outside-cache-test.txt'));
    expect(result.code).toBe(0);
    expect(await archiveFiles(cache.archive!)).toEqual(['other/file.txt']);
  });
});
