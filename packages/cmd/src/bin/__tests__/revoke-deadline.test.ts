import fs from 'fs-extra';
import http from 'http';
import { AddressInfo } from 'net';
import os from 'os';
import { join } from 'path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { cliPath, runCli } from '../../test-utils/cli';

const API_TOKEN = 'crnts_ciapi_deadline';
const RECORD_KEY = 'crnts_ci_deadline';

type Failing = 'none' | 'command';

/**
 * A director and REST API in one server. The revoke endpoints send their
 * headers at once, then a byte every 100 ms for 10 s: the revoke ends only by
 * its deadline.
 */
async function startServer(failing: Failing) {
  const revokes: { path: string; at: number; body: string }[] = [];
  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const body = Buffer.concat(chunks).toString();
      const path = req.url?.split('?')[0];
      const json = (status: number, data: unknown) =>
        res
          .writeHead(status, { 'content-type': 'application/json' })
          .end(JSON.stringify(data));
      if (path === '/github-token') return json(200, { value: 'github-jwt' });
      if (path === '/oidc/token') {
        return json(200, { access_token: RECORD_KEY, expires_in: 600 });
      }
      if (path === '/oidc/api/token') {
        return json(200, { access_token: API_TOKEN, expires_in: 600 });
      }
      if (path === '/oidc/revoke' || path === '/oidc/api/revoke') {
        revokes.push({ path, at: Date.now(), body });
        res.writeHead(200, { 'content-type': 'text/plain' });
        res.flushHeaders();
        const interval = setInterval(() => res.write('x'), 100);
        const stop = setTimeout(() => {
          clearInterval(interval);
          res.end();
        }, 10_000);
        res.on('close', () => {
          clearInterval(interval);
          clearTimeout(stop);
        });
        return;
      }
      if (failing === 'command') return json(404, { message: 'not found' });
      if (path === '/cache/upload') {
        return json(200, {
          cacheId: 'cache-1',
          orgId: 'org',
          uploadUrl: `${url}/put/archive`,
          metaUploadUrl: `${url}/put/meta`,
          refMetaUploadUrl: `${url}/put/ref-meta`,
          cacheKey: 'k',
          metaCacheKey: 'm',
        });
      }
      if (path === '/v1/runs/r1') return json(200, { data: { runId: 'r1' } });
      return json(200, {});
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return {
    url,
    revokes,
    close: () => {
      server.closeAllConnections();
      server.close();
    },
  };
}

const githubEnv = (url: string) => ({
  ACTIONS_ID_TOKEN_REQUEST_URL: `${url}/github-token`,
  ACTIONS_ID_TOKEN_REQUEST_TOKEN: 'request-token',
});

type Case = {
  name: string;
  failing: Failing;
  args: string[];
  env: (url: string) => Record<string, string>;
  code: number;
  revokePath: string;
  token: string;
  stdout?: string;
};

const cases: Case[] = [
  ...(['none', 'command'] as const).map(
    (failing): Case => ({
      name: `recording, the command ${failing === 'none' ? 'succeeds' : 'fails'}`,
      failing,
      args: ['cache', 'set', '--id', 'cache-1', '--path', 'cached.txt'],
      env: (url) => ({ ...githubEnv(url), CURRENTS_PROJECT_ID: 'p1' }),
      code: failing === 'none' ? 0 : 1,
      revokePath: '/oidc/revoke',
      token: RECORD_KEY,
    })
  ),
  ...(['none', 'command'] as const).map(
    (failing): Case => ({
      name: `API fallback, the request ${failing === 'none' ? 'succeeds' : 'fails'}`,
      failing,
      args: ['api', '/v1/runs/r1', '--project-id', 'p1'],
      env: (url) => ({
        ...githubEnv(url),
        GITHUB_ACTIONS: 'true',
        CURRENTS_REST_API_URL: url,
      }),
      code: failing === 'none' ? 0 : 1,
      revokePath: '/oidc/api/revoke',
      token: API_TOKEN,
      stdout: failing === 'none' ? '{"data":{"runId":"r1"}}' : undefined,
    })
  ),
  ...[
    ['CURRENTS_RECORD_KEY', RECORD_KEY, '/oidc/revoke'],
    ['CURRENTS_API_KEY', API_TOKEN, '/oidc/api/revoke'],
  ].map(
    ([env, token, revokePath]): Case => ({
      name: `ci auth revoke of ${env}`,
      failing: 'none',
      args: ['ci', 'auth', 'revoke'],
      env: () => ({ [env]: token }),
      code: 1,
      revokePath,
      token,
      stdout: '',
    })
  ),
];

describe.concurrent('a revoke that never ends', () => {
  let dir: string;

  beforeAll(async () => {
    if (!fs.existsSync(cliPath)) {
      throw new Error(`Build the CLI first: ${cliPath} is missing`);
    }
    dir = await fs.mkdtemp(join(os.tmpdir(), 'currents-revoke-'));
    await fs.writeFile(join(dir, 'cached.txt'), 'cached');
  });

  afterAll(async () => {
    await fs.remove(dir);
  });

  describe.each([[[]], [['--debug']]])('with %j', (extraArgs) => {
    it.each(cases)(
      '$name: ends 5 s after the revoke starts, with its exit code',
      async (c) => {
        const server = await startServer(c.failing);
        try {
          const result = await runCli([...c.args, ...extraArgs], {
            cwd: dir,
            env: { CURRENTS_API_URL: server.url, ...c.env(server.url) },
          });
          const exitedAt = Date.now();

          expect(result.code).toBe(c.code);
          expect(server.revokes).toHaveLength(1);
          const [revoke] = server.revokes;
          expect(revoke.path).toBe(c.revokePath);
          expect(new URLSearchParams(revoke.body).get('token')).toBe(c.token);
          const cleanupMs = exitedAt - revoke.at;
          expect(cleanupMs).toBeGreaterThan(4500);
          expect(cleanupMs).toBeLessThan(6500);
          if (c.stdout !== undefined) {
            expect(result.stdout.trim()).toBe(c.stdout);
          }
          expect(result.stderr).not.toContain('Revoked');
          // The GitHub mask commands hold the token on purpose.
          expect(
            (result.stdout + result.stderr).replace(/^::add-mask::.*$/gm, '')
          ).not.toContain(c.token);
        } finally {
          server.close();
        }
      },
      20_000
    );
  });
});
