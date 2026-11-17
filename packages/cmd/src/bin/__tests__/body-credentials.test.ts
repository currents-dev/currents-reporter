import fs from 'fs-extra';
import os from 'os';
import { join } from 'path';
import { gunzipSync } from 'zlib';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  ApiServer,
  RecordedRequest,
  Response,
  startApiServer,
} from '../../test-utils/api-server';
import { runCli } from '../../test-utils/cli';
import { leakedSecrets, reflections } from '../../test-utils/secrets';

const fixtureDir = join(
  __dirname,
  '../../services/upload/__tests__/fixtures/jest-report'
);

const SECRET = 'Record-Pr6_X+1/a.b=';

const reflecting: Response = {
  status: 400,
  json: {
    message: `bad key ${reflections(SECRET).join(' ')}`,
    errors: reflections(SECRET),
    guidance: 'check the project ID',
  },
};

/** The JSON body of a request, gunzipped when it is gzipped. */
const bodyOf = (request: RecordedRequest) =>
  JSON.parse(
    (request.headers['content-encoding'] === 'gzip'
      ? gunzipSync(request.body)
      : request.body
    ).toString()
  );

const commands: [string, string[], string][] = [
  [
    'run cancel',
    ['run', 'cancel', '--project-id', 'p1', '--ci-build-id', 'b1'],
    '/v1/runs/cancel',
  ],
  [
    'cache set',
    ['cache', 'set', '--id', 'cache-1', '--path', 'cached.txt'],
    '/cache/upload',
  ],
  ['cache get', ['cache', 'get', '--id', 'cache-1'], '/cache/meta'],
  [
    'cache get, the download request',
    ['cache', 'get', '--id', 'cache-1'],
    '/cache/v2/download',
  ],
  [
    'run upload',
    [
      'run',
      'upload',
      '--project-id',
      'p1',
      '--ci-build-id',
      'b1',
      '--report-dir',
      'report',
    ],
    '/v1/runs',
  ],
];

describe('a record key that the server repeats', () => {
  let api: ApiServer;
  let dir: string;
  let respond: (request: RecordedRequest) => Response;

  beforeEach(async () => {
    dir = await fs.mkdtemp(join(os.tmpdir(), 'currents-body-'));
    await fs.copy(fixtureDir, join(dir, 'report'));
    await fs.writeFile(join(dir, 'cached.txt'), 'cached');
    respond = () => reflecting;
    api = await startApiServer((request) => respond(request));
  });

  /** cache get reaches its download request only after the meta answers. */
  const failOnly = (path: string) => {
    respond = (request) => {
      if (request.url === path) return reflecting;
      if (request.url === '/cache/meta') {
        return {
          status: 200,
          json: { cacheId: 'cache-1', refMetaReadUrl: `${api.url}/ref-meta` },
        };
      }
      if (request.url === '/ref-meta') {
        return { status: 200, json: { cacheKey: 'k', id: 'cache-1' } };
      }
      return reflecting;
    };
  };

  afterEach(async () => {
    await api.close();
    await fs.remove(dir);
  });

  const run = (args: string[]) =>
    runCli([...args, '--key', SECRET], {
      cwd: dir,
      env: { CURRENTS_API_URL: api.url },
    });

  describe.each([[[]], [['--debug']]])('with %j', (extraArgs) => {
    it.each(commands)(
      '%s prints no spelling of it',
      async (_name, args, path) => {
        failOnly(path);
        const result = await run([...args, ...extraArgs]);

        expect(result.code).toBe(1);
        const target = api.requests.find((r) => r.url === path);
        expect(target).toBeDefined();
        const sent = bodyOf(target!);
        expect(sent.recordKey).toBe(SECRET);
        expect(sent).not.toHaveProperty('secrets');
        expect(leakedSecrets(result.stdout, [SECRET])).toEqual([]);
        expect(leakedSecrets(result.stderr, [SECRET])).toEqual([]);
        expect(result.stdout + result.stderr).toContain('*****');
      }
    );
  });

  it.each([
    ['run cancel', commands[0][1], '/v1/runs/cancel'],
    ['run upload', commands[4][1], '/v1/runs'],
  ])(
    '%s prints no spelling of it after a 503 and a 400, and sends the same body twice',
    async (_name, args, path) => {
      let attempt = 0;
      respond = (request) =>
        request.url === path && attempt++ === 0
          ? { ...reflecting, status: 503 }
          : reflecting;

      const result = await run([...args, '--debug']);

      expect(result.code).toBe(1);
      const sent = api.requests.filter((r) => r.url === path).map(bodyOf);
      expect(sent).toHaveLength(2);
      expect(sent[1]).toEqual(sent[0]);
      expect(sent[0].recordKey).toBe(SECRET);
      expect(leakedSecrets(result.stdout + result.stderr, [SECRET])).toEqual(
        []
      );
    },
    15_000
  );
});
