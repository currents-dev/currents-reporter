import fs from 'fs-extra';
import http from 'http';
import { AddressInfo } from 'net';
import os from 'os';
import { join } from 'path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { cliPath, runCli } from '../../test-utils/cli';

const API_TOKEN = 'crnts_ciapi_deadline';
const RECORD_KEY = 'crnts_ci_deadline';

/**
 * The revoke endpoints send their headers at once, then a byte every 100 ms
 * for 10 s: the revoke ends only by its deadline.
 */
async function startServer() {
  const revokes: { path: string; at: number; body: string }[] = [];
  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const body = Buffer.concat(chunks).toString();
      const path = req.url?.split('?')[0];
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
      res.writeHead(404).end();
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

type Case = {
  name: string;
  args: string[];
  env: (url: string) => Record<string, string>;
  code: number;
  revokePath: string;
  token: string;
  stdout?: string;
};

const cases: Case[] = [
  ...[
    ['CURRENTS_RECORD_KEY', RECORD_KEY, '/oidc/revoke'],
    ['CURRENTS_API_KEY', API_TOKEN, '/oidc/api/revoke'],
  ].map(
    ([env, token, revokePath]): Case => ({
      name: `ci auth revoke of ${env}`,
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
  });

  afterAll(async () => {
    await fs.remove(dir);
  });

  describe.each([[[]], [['--debug']]])('with %j', (extraArgs) => {
    it.each(cases)(
      '$name: ends 5 s after the revoke starts, with its exit code',
      async (c) => {
        const server = await startServer();
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
