import { format } from 'node:util';
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
// @ts-ignore
import { disable as disableDebug } from 'debug';
import { enableDebug } from '../../debug';
import {
  ApiServer,
  RecordedRequest,
  Response,
  startApiServer,
} from '../../test-utils/api-server';
import { dumps, leakedSecrets, reflections } from '../../test-utils/secrets';
import { ClientType, createClient, RequestConfig } from '../client';
import { makeRequest } from '../http';
import { HttpError } from '../send';

// The retry delays are 3s to 30s.
vi.mock('../httpRetry', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../httpRetry')>()),
  getDelay: () => 1,
}));

// URL- and regex-significant characters, so that the encoded form differs.
const SECRET = 'Record-Pr6_X+1/a.b=';
const SECRET2 = 'Other-Pr6_Y+2/c.d=';
const SECRETS = [SECRET, SECRET2];

/** A 400 that repeats the secrets in every spelling and every kind of place. */
const reflectingResponse = (secrets = SECRETS, status = 400): Response => ({
  status,
  headers: { 'x-echo': secrets.join(' ') },
  json: {
    message: `bad key ${secrets.flatMap(reflections).join(' ')}`,
    errors: secrets.flatMap(reflections),
    nested: { list: [{ value: secrets[0] }] },
    [secrets[0]]: 'as a property name',
    guidance: 'check the project ID',
    unrelated: 'Record-Other-Value',
    count: 3,
    ok: true,
    none: null,
  },
});

describe('credentials in the request body', () => {
  let server: ApiServer;
  let respond: (request: RecordedRequest) => Response;
  let output: string;

  beforeAll(async () => {
    server = await startApiServer((request) => respond(request));
  });

  afterAll(async () => {
    await server.close();
  });

  beforeEach(() => {
    server.requests.length = 0;
    respond = () => reflectingResponse();
    output = '';
    vi.stubEnv('CURRENTS_API_URL', server.url);
    const capture = (...args: unknown[]) => {
      output += `${format(...args)}\n`;
    };
    vi.spyOn(console, 'log').mockImplementation(capture);
    vi.spyOn(console, 'warn').mockImplementation(capture);
    vi.spyOn(console, 'error').mockImplementation(capture);
    vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
      output += String(chunk);
      return true;
    });
  });

  afterEach(() => {
    disableDebug();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  async function failedRequest(config: RequestConfig) {
    try {
      await createClient(ClientType.API).request(config);
    } catch (e) {
      return e as HttpError;
    }
    throw new Error('the request did not fail');
  }

  /** No spelling of a secret in any dump of the error; a mask is visible. */
  function expectSafe(error: HttpError, secrets = SECRETS) {
    const text = dumps(error);
    expect(leakedSecrets(text, secrets)).toEqual([]);
    expect(text).toContain('*****');
  }

  const cancelBody = () => ({
    recordKey: SECRET,
    projectId: 'p1',
    config: { currents: { recordKey: SECRET } },
    instances: [{ token: SECRET2 }],
    empty: '',
    missing: null,
    numeric: 5,
  });

  it('finds the keys of a body object, nested and in arrays', async () => {
    const error = await failedRequest({
      method: 'POST',
      url: 'v1/runs/cancel',
      data: cancelBody(),
    });

    expectSafe(error);
    expect(error.response?.data).toMatchObject({
      guidance: 'check the project ID',
      unrelated: 'Record-Other-Value',
      count: 3,
      ok: true,
      none: null,
    });
    expect(error.response?.headers['x-echo']).not.toContain(SECRET);
  });

  it('finds the key of a JSON string body, escapes included, and sends it as it is', async () => {
    const body = JSON.stringify({ recordKey: 'X' }).replace(
      'X',
      Array.from(
        SECRET,
        (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`
      ).join('')
    );

    const error = await failedRequest({
      method: 'POST',
      url: 'v1/runs/cancel',
      data: body,
    });

    expectSafe(error, [SECRET]);
    expect(server.requests[0].body.toString()).toBe(body);
  });

  it('finds every value of the key fields of a form body', async () => {
    const body = new URLSearchParams([
      ['token', SECRET],
      ['token', SECRET2],
      ['project_id', 'p1'],
    ]).toString();
    expect(body).toContain('%2B');

    const error = await failedRequest({
      method: 'POST',
      url: 'oidc/revoke',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      data: body,
    });

    expectSafe(error);
    expect(server.requests[0].body.toString()).toBe(body);
  });

  it('takes the secrets of a binary body from `secrets`, with the headers too', async () => {
    const error = await failedRequest({
      method: 'POST',
      url: 'v1/runs',
      headers: {
        Authorization: 'BEARER header-api-key',
        'x-currents-key': 'header-record-key',
      },
      data: Buffer.from('compressed'),
      secrets: [SECRET, SECRET2],
    });

    expectSafe(error, [...SECRETS, 'header-api-key', 'header-record-key']);
    expect(dumps(error)).not.toContain('secrets');
    expect(server.requests[0].body.toString()).toBe('compressed');
    expect(server.requests[0].headers).not.toHaveProperty('secrets');
  });

  it('keeps no secret in the request data of the error', async () => {
    for (const data of [
      cancelBody(),
      JSON.stringify(cancelBody()),
      new URLSearchParams([['token', SECRET]]).toString(),
      Buffer.from(SECRET),
    ]) {
      respond = () => ({ status: 400, json: {} });
      const error = await failedRequest({
        method: 'POST',
        url: 'v1/runs/cancel',
        data,
        secrets: Buffer.isBuffer(data) ? [SECRET] : undefined,
      });
      expect(leakedSecrets(dumps(error), SECRETS)).toEqual([]);
      if (Buffer.isBuffer(data)) {
        expect(error.config.data).toBe('<binary body>');
      }
    }
  });

  it('keeps no secret in the error of a request that got no response', async () => {
    respond = () => ({ destroy: true });

    const error = await failedRequest({
      method: 'POST',
      url: 'v1/runs/cancel',
      data: cancelBody(),
      maxRetries: 0,
    });

    expect(error.response).toBeUndefined();
    expect(leakedSecrets(dumps(error), SECRETS)).toEqual([]);
  });

  it('hides a secret known only from `secrets`, wherever the body holds it', async () => {
    const error = await failedRequest({
      method: 'POST',
      url: 'v1/runs',
      data: { note: `copied ${SECRET}`, [SECRET]: 1 },
      secrets: [SECRET],
    });

    expect(leakedSecrets(dumps(error), [SECRET])).toEqual([]);
  });

  it('changes no data of the caller and sends the same body on every attempt', async () => {
    const data = Object.freeze({
      recordKey: SECRET,
      config: Object.freeze({ currents: Object.freeze({ recordKey: SECRET }) }),
    });
    const secrets = Object.freeze([SECRET]) as string[];
    let attempt = 0;
    respond = () => reflectingResponse([SECRET], attempt++ === 0 ? 503 : 400);

    const error = await failedRequest({
      method: 'POST',
      url: 'v1/runs/cancel',
      data,
      secrets,
    });

    expectSafe(error, [SECRET]);
    expect(data.recordKey).toBe(SECRET);
    expect(secrets).toEqual([SECRET]);
    expect(server.requests).toHaveLength(2);
    for (const request of server.requests) {
      expect(request.json).toEqual({
        recordKey: SECRET,
        config: { currents: { recordKey: SECRET } },
      });
    }
  });

  it('sends the body unchanged when a retried request succeeds', async () => {
    let attempt = 0;
    respond = () =>
      attempt++ === 0 ? { status: 503 } : { status: 200, json: { ok: 1 } };

    const res = await createClient(ClientType.API).request({
      method: 'POST',
      url: 'v1/runs/cancel',
      data: cancelBody(),
      secrets: [SECRET],
    });

    expect(res.data).toEqual({ ok: 1 });
    expect(server.requests.map((r) => r.json)).toEqual([
      cancelBody(),
      cancelBody(),
    ]);
  });

  describe.each([[false], [true]])('logs, with debug %s', (debugOn) => {
    beforeEach(() => {
      if (debugOn) enableDebug();
    });

    it.each([400, 422])(
      'prints no secret for a %d through makeRequest',
      async (status) => {
        respond = () => reflectingResponse(SECRETS, status);

        await expect(
          makeRequest(ClientType.API, {
            method: 'POST',
            url: 'v1/runs/cancel',
            data: cancelBody(),
          })
        ).rejects.toThrow(`status code ${status}`);

        expect(leakedSecrets(output, SECRETS)).toEqual([]);
        expect(output).toContain('*****');
        // The 422 warning names no request.
        if (status === 400) expect(output).toContain('v1/runs/cancel');
      }
    );

    it('prints no secret in the retry check and messages of a 503 then a 400', async () => {
      let attempt = 0;
      respond = () =>
        attempt++ === 0
          ? reflectingResponse(SECRETS, 503)
          : reflectingResponse();

      await expect(
        makeRequest(ClientType.API, {
          method: 'POST',
          url: 'v1/runs/cancel',
          data: cancelBody(),
        })
      ).rejects.toThrow('status code 400');

      expect(server.requests).toHaveLength(2);
      expect(leakedSecrets(output, SECRETS)).toEqual([]);
      if (debugOn) expect(output).toContain('isRetriableError');
    });
  });
});
