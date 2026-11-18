import { ChildProcess, spawn } from 'child_process';
import fs from 'fs-extra';
import { pick } from 'lodash';
import os from 'os';
import { join } from 'path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { cliPath } from '../../test-utils/cli';
import {
  ApiServer,
  Response,
  startApiServer,
} from '../../test-utils/api-server';

const API_TOKEN = 'crnts_ciapi_signal';
const RECORD_KEY = 'crnts_ci_signal';
const OIDC_JWT = 'provider-jwt';

type Case = {
  name: string;
  args: string[];
  env: (server: ApiServer) => Record<string, string>;
  // The request that never answers, so the command is still running when the
  // signal arrives.
  hangingPath: string;
  revokePath: string;
  token: string;
};

const cases: Case[] = [
  {
    name: 'currents api with an API token from CURRENTS_OIDC_API_TOKEN',
    args: ['api', '/v1/runs/r1', '--project-id', 'p1'],
    env: (server) => ({
      CURRENTS_OIDC_API_TOKEN: OIDC_JWT,
      CURRENTS_REST_API_URL: server.url,
    }),
    hangingPath: '/v1/runs/r1',
    revokePath: '/oidc/api/revoke',
    token: API_TOKEN,
  },
  {
    name: 'cache set with a record key from CURRENTS_OIDC_TOKEN',
    args: ['cache', 'set', '--id', 'cache-1', '--path', 'cached.txt'],
    env: () => ({
      CURRENTS_OIDC_TOKEN: OIDC_JWT,
      CURRENTS_PROJECT_ID: 'p1',
    }),
    hangingPath: '/cache/upload',
    revokePath: '/oidc/revoke',
    token: RECORD_KEY,
  },
];

const pathOf = (url: string) => url.split('?')[0];
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(condition: () => boolean, ms: number) {
  for (let waited = 0; !condition() && waited < ms; waited += 50) {
    await sleep(50);
  }
  return condition();
}

const exited = (child: ChildProcess) =>
  new Promise<{ code: number | null; signal: NodeJS.Signals | null }>(
    (resolve) => child.once('exit', (code, signal) => resolve({ code, signal }))
  );

const exitCodes = { SIGINT: 130, SIGTERM: 143 } as const;

// A CI job that is cancelled sends SIGINT, then SIGTERM, to the CLI. On
// Windows, child.kill ends the process without a signal the CLI can handle.
describe.skipIf(process.platform === 'win32')(
  'a command stopped by a signal after the OIDC exchange',
  () => {
    let dir: string;

    beforeAll(async () => {
      if (!fs.existsSync(cliPath)) {
        throw new Error(`Build the CLI first: ${cliPath} is missing`);
      }
      dir = await fs.mkdtemp(join(os.tmpdir(), 'currents-signal-'));
      await fs.writeFile(join(dir, 'cached.txt'), 'cached');
    });

    afterAll(async () => {
      await fs.remove(dir);
    });

    describe.each(cases)('$name', (c) => {
      it.each(['SIGINT', 'SIGTERM'] as const)(
        'revokes the credential on %s and exits with the code for the signal',
        async (signal) => {
          const server = await startApiServer((request) => {
            const path = pathOf(request.url);
            if (path === '/oidc/token') {
              return {
                status: 200,
                json: { access_token: RECORD_KEY, expires_in: 600 },
              };
            }
            if (path === '/oidc/api/token') {
              return {
                status: 200,
                json: { access_token: API_TOKEN, expires_in: 600 },
              };
            }
            if (path === c.revokePath) return { status: 200 };
            if (path === c.hangingPath) return { hang: true };
            return { status: 404 };
          });
          const child = spawn(process.execPath, [cliPath, ...c.args], {
            cwd: dir,
            env: {
              ...pick(process.env, ['PATH']),
              HOME: dir,
              CURRENTS_API_URL: server.url,
              ...c.env(server),
            },
            stdio: 'ignore',
          });
          const done = exited(child);
          try {
            const started = await waitFor(
              () =>
                server.requests.some((r) => pathOf(r.url) === c.hangingPath),
              10_000
            );
            expect(started).toBe(true);

            child.kill(signal);
            expect(await Promise.race([done, sleep(8000)])).toEqual({
              code: exitCodes[signal],
              signal: null,
            });

            const revokes = server.requests.filter(
              (r) => pathOf(r.url) === c.revokePath
            );
            expect(revokes).toHaveLength(1);
            expect(
              new URLSearchParams(revokes[0].body.toString()).get('token')
            ).toBe(c.token);
          } finally {
            child.kill('SIGKILL');
            await server.close();
          }
        },
        30_000
      );
    });
    const apiCase = cases[0];

    const hang: Response = { hang: true };

    async function startApi({
      api,
      revoke,
    }: {
      api: Response;
      revoke: () => Response | Promise<Response>;
    }) {
      return startApiServer((request) => {
        const path = pathOf(request.url);
        if (path === '/oidc/api/token') {
          return {
            status: 200,
            json: { access_token: API_TOKEN, expires_in: 600 },
          };
        }
        if (path === apiCase.revokePath) {
          return revoke();
        }
        if (path === apiCase.hangingPath) return api;
        return { status: 404 };
      });
    }

    function runApi(server: ApiServer, env: Record<string, string>) {
      return spawn(process.execPath, [cliPath, ...apiCase.args], {
        cwd: dir,
        env: {
          ...pick(process.env, ['PATH']),
          HOME: dir,
          CURRENTS_API_URL: server.url,
          CURRENTS_REST_API_URL: server.url,
          ...env,
        },
        stdio: 'ignore',
      });
    }

    it('stops at once on a second SIGINT while the revoke is waiting', async () => {
      const server = await startApi({ api: hang, revoke: () => hang });
      const child = runApi(server, { CURRENTS_OIDC_API_TOKEN: OIDC_JWT });
      const done = exited(child);
      try {
        expect(
          await waitFor(
            () =>
              server.requests.some(
                (r) => pathOf(r.url) === apiCase.hangingPath
              ),
            10_000
          )
        ).toBe(true);
        child.kill('SIGINT');
        expect(
          await waitFor(
            () =>
              server.requests.some((r) => pathOf(r.url) === apiCase.revokePath),
            5000
          )
        ).toBe(true);

        child.kill('SIGINT');
        expect(await Promise.race([done, sleep(1000)])).toEqual({
          code: null,
          signal: 'SIGINT',
        });
      } finally {
        child.kill('SIGKILL');
        await server.close();
      }
    }, 30_000);

    it('stops at once on SIGINT when there was no OIDC exchange', async () => {
      const server = await startApi({
        api: hang,
        revoke: () => ({ status: 200 }),
      });
      const child = runApi(server, { CURRENTS_API_KEY: 'api-key' });
      const done = exited(child);
      try {
        expect(
          await waitFor(
            () =>
              server.requests.some(
                (r) => pathOf(r.url) === apiCase.hangingPath
              ),
            10_000
          )
        ).toBe(true);

        child.kill('SIGINT');
        expect(await Promise.race([done, sleep(1000)])).toEqual({
          code: null,
          signal: 'SIGINT',
        });
      } finally {
        child.kill('SIGKILL');
        await server.close();
      }
    }, 30_000);
    const requested = (server: ApiServer, path: string) =>
      waitFor(
        () => server.requests.some((r) => pathOf(r.url) === path),
        10_000
      );

    it.each([
      { result: 'succeeds', api: { status: 200, json: {} }, signal: 'SIGINT' },
      { result: 'fails', api: { status: 404 }, signal: 'SIGTERM' },
    ] as const)(
      'exits with the code for $signal when the command $result and the signal arrives during the revoke',
      async ({ api, signal }) => {
        let answerRevoke = () => {};
        const revokeAnswered = new Promise<Response>((resolve) => {
          answerRevoke = () => resolve({ status: 200 });
        });
        const server = await startApi({ api, revoke: () => revokeAnswered });
        const child = runApi(server, { CURRENTS_OIDC_API_TOKEN: OIDC_JWT });
        const done = exited(child);
        try {
          expect(await requested(server, apiCase.revokePath)).toBe(true);
          child.kill(signal);
          await sleep(150);
          answerRevoke();

          expect(await Promise.race([done, sleep(8000)])).toEqual({
            code: exitCodes[signal],
            signal: null,
          });
          expect(
            server.requests.filter((r) => pathOf(r.url) === apiCase.revokePath)
          ).toHaveLength(1);
        } finally {
          child.kill('SIGKILL');
          await server.close();
        }
      },
      30_000
    );

    it('exits with 130 after the 5 s revoke deadline when SIGINT arrives during a revoke that never answers', async () => {
      const server = await startApi({
        api: { status: 200, json: {} },
        revoke: () => hang,
      });
      const child = runApi(server, { CURRENTS_OIDC_API_TOKEN: OIDC_JWT });
      const done = exited(child);
      try {
        expect(await requested(server, apiCase.revokePath)).toBe(true);
        const revokeStarted = Date.now();
        child.kill('SIGINT');

        expect(await Promise.race([done, sleep(8000)])).toEqual({
          code: 130,
          signal: null,
        });
        const cleanupMs = Date.now() - revokeStarted;
        expect(cleanupMs).toBeGreaterThan(4000);
        expect(cleanupMs).toBeLessThan(6500);
      } finally {
        child.kill('SIGKILL');
        await server.close();
      }
    }, 30_000);
  }
);
