import fs from 'fs-extra';
import os from 'os';
import { join } from 'path';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { ApiServer, startApiServer } from '../../test-utils/api-server';
import { runCli } from '../../test-utils/cli';
import { ClientType, createClient } from '../client';
import { getRestAPIBaseUrl, requireRestAPIBaseUrl } from '../httpConfig';

const KEY = 'sentinel-record-key';

describe('requests that carry a record key', () => {
  let origin: ApiServer;
  let elsewhere: ApiServer;
  let redirectStatus: number;

  beforeAll(async () => {
    origin = await startApiServer(() => ({
      status: redirectStatus,
      headers: { location: `${elsewhere.url}/stolen` },
    }));
    elsewhere = await startApiServer(() => ({ status: 200, json: {} }));
  });

  afterAll(async () => {
    await origin.close();
    await elsewhere.close();
  });

  beforeEach(() => {
    origin.requests.length = 0;
    elsewhere.requests.length = 0;
    vi.stubEnv('CURRENTS_API_URL', origin.url);
    vi.stubEnv('CURRENTS_REST_API_URL', origin.url);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe.each([307, 308])('a %d redirect', (status) => {
    beforeEach(() => {
      redirectStatus = status;
    });

    it('is refused for a request to the director, and the body goes nowhere else', async () => {
      const client = createClient(ClientType.API);

      await expect(
        client.request({
          method: 'POST',
          url: 'v1/runs/cancel',
          data: { recordKey: KEY, projectId: 'p' },
        })
      ).rejects.toThrow('redirect');

      expect(origin.requests).toHaveLength(1);
      expect(elsewhere.requests).toEqual([]);
    });

    it('is refused for a REST request with x-currents-key', async () => {
      const client = createClient(ClientType.REST_API);

      await expect(
        client.request({
          method: 'POST',
          url: 'v1/sessions',
          headers: { 'x-currents-key': KEY },
          data: { title: 't' },
        })
      ).rejects.toThrow('redirect');

      expect(elsewhere.requests).toEqual([]);
    });

    it('is refused for a REST request with only an API key', async () => {
      const client = createClient(ClientType.REST_API);

      await expect(
        client.request({
          method: 'GET',
          url: 'v1/runs/r',
          headers: { Authorization: 'Bearer sentinel-api-key' },
        })
      ).rejects.toThrow('redirect');

      expect(elsewhere.requests).toEqual([]);
    });
  });

  it('is refused when it names a subdomain of the same host and port, which the transport would trust', async () => {
    // The redirect names a subdomain on the port of the server that sends it,
    // the case in which the transport keeps Authorization.
    let sameHostOrigin: ApiServer;
    sameHostOrigin = await startApiServer(() => ({
      status: 307,
      headers: {
        location: `http://child.localhost:${new URL(sameHostOrigin.url).port}/stolen`,
      },
    }));
    vi.stubEnv(
      'CURRENTS_REST_API_URL',
      sameHostOrigin.url.replace('127.0.0.1', 'localhost')
    );
    const client = createClient(ClientType.REST_API);

    await expect(
      client.request({
        method: 'GET',
        url: 'v1/runs/r',
        headers: { Authorization: 'Bearer sentinel-api-key' },
      })
    ).rejects.toThrow('redirect');

    // The redirect is not followed, so nothing asks for the subdomain.
    expect(sameHostOrigin.requests).toHaveLength(1);
    await sameHostOrigin.close();
  });
});

describe('the REST API address', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each([
    [undefined, undefined, 'https://api.currents.dev'],
    ['https://cy.currents.dev', undefined, 'https://api.currents.dev'],
    ['https://cy.currents.dev/', undefined, 'https://api.currents.dev'],
    ['https://cy.currents.dev/api', undefined, 'https://api.currents.dev'],
    ['https://cy.currents.dev/api/', undefined, 'https://api.currents.dev'],
    ['https://CY.currents.dev:443/', undefined, 'https://api.currents.dev'],
    ['https://cy-staging.currents.dev', undefined, undefined],
    ['https://cy.currents.dev:8443', undefined, undefined],
    ['http://cy.currents.dev', undefined, undefined],
    ['not a url', undefined, undefined],
    ['https://currents.acme.internal', undefined, undefined],
    ['http://localhost:1234', undefined, undefined],
    [
      'https://currents.acme.internal',
      'https://api.acme.internal',
      'https://api.acme.internal',
    ],
    [undefined, 'https://api.acme.internal', 'https://api.acme.internal'],
    ['https://currents.acme.internal', '  ', undefined],
  ])(
    'for CURRENTS_API_URL %s and CURRENTS_REST_API_URL %s is %s',
    (apiUrl, restUrl, expected) => {
      vi.stubEnv('CURRENTS_API_URL', apiUrl);
      vi.stubEnv('CURRENTS_REST_API_URL', restUrl);

      expect(getRestAPIBaseUrl()).toBe(expected);
    }
  );

  it('is refused with a message that names the variable when it would be a guess', () => {
    vi.stubEnv('CURRENTS_API_URL', 'https://currents.acme.internal');
    vi.stubEnv('CURRENTS_REST_API_URL', undefined);

    expect(() => requireRestAPIBaseUrl()).toThrow('CURRENTS_REST_API_URL');
    expect(() => requireRestAPIBaseUrl()).toThrow('Currents staging');
    expect(() => createClient(ClientType.REST_API)).toThrow(
      'CURRENTS_REST_API_URL'
    );
  });
});

describe('the built CLI with a record key from ci auth', () => {
  let origin: ApiServer;
  let elsewhere: ApiServer;
  let workDir: string;
  let issuedKey: string;

  beforeAll(async () => {
    issuedKey = 'crnts_ci_sentinelissuedkeyABCDEFGHIJKLMNO';
    elsewhere = await startApiServer(() => ({ status: 200, json: {} }));
    origin = await startApiServer(() => ({
      status: 307,
      headers: { location: `${elsewhere.url}/stolen` },
    }));
    workDir = await fs.mkdtemp(join(os.tmpdir(), 'currents-redirect-'));
  });

  afterAll(async () => {
    await origin.close();
    await elsewhere.close();
    await fs.remove(workDir);
  });

  it('does not send the issued key to the address of a redirect', async () => {
    const result = await runCli(
      ['run', 'cancel', '--project-id', 'p', '--run-id', 'r'],
      {
        cwd: workDir,
        env: {
          CURRENTS_API_URL: origin.url,
          CURRENTS_RECORD_KEY: issuedKey,
        },
      }
    );

    expect(result.code).toBe(1);
    expect(result.stdout + result.stderr).toContain('redirect');
    expect(origin.requests.map((r) => r.url)).toContain('/v1/runs/cancel');
    expect(elsewhere.requests).toEqual([]);
    expect(result.stdout + result.stderr).not.toContain(issuedKey);
  });
});
