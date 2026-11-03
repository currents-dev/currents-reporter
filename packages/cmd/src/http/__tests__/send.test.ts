import http from 'http';
import { AddressInfo } from 'net';
import { Readable } from 'stream';
import zlib from 'zlib';
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { HttpError, sendRequest } from '../send';

type Received = {
  method?: string;
  url?: string;
  headers: http.IncomingHttpHeaders;
  body: string;
};

type Handler = (req: Received, res: http.ServerResponse) => void;

let server: http.Server;
let origin: string;
let port: number;
let received: Received[];
let handler: Handler;

beforeAll(async () => {
  server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const r = {
        method: req.method,
        url: req.url,
        headers: req.headers,
        body: Buffer.concat(chunks).toString(),
      };
      received.push(r);
      if (req.url?.startsWith('/drop')) return req.socket.destroy();
      handler(r, res);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  port = (server.address() as AddressInfo).port;
  origin = `http://127.0.0.1:${port}`;
});

afterAll(() => {
  server.close();
  server.closeAllConnections();
});

afterEach(() => {
  received = [];
  handler = (_req, res) => res.writeHead(200).end();
});
received = [];
handler = (_req, res) => res.writeHead(200).end();

const json = (status: number, body: unknown, headers = {}) =>
  ((_req, res) =>
    res
      .writeHead(status, { 'content-type': 'application/json', ...headers })
      .end(JSON.stringify(body))) as Handler;

describe('sendRequest', () => {
  it('sends the headers axios sent, and the headers of the request over them', async () => {
    await sendRequest({
      method: 'post',
      url: `${origin}/a`,
      body: '{"a":1}',
      headers: { 'Content-Type': 'application/json', Accept: 'text/plain' },
    });

    expect(received[0]).toMatchObject({ method: 'POST', body: '{"a":1}' });
    expect(received[0].headers).toMatchObject({
      accept: 'text/plain',
      'user-agent': 'axios/1.20.0',
      'accept-encoding': 'gzip, compress, deflate, br',
      'content-type': 'application/json',
      'content-length': '7',
      connection: 'keep-alive',
    });
  });

  it('parses a JSON body whatever its content type, and keeps other text', async () => {
    handler = (_req, res) => res.writeHead(200).end('{"ok":true}');
    expect((await sendRequest({ method: 'GET', url: origin })).data).toEqual({
      ok: true,
    });

    handler = (_req, res) => res.writeHead(200).end('\uFEFFplain text');
    expect((await sendRequest({ method: 'GET', url: origin })).data).toBe(
      'plain text'
    );

    handler = (_req, res) => res.writeHead(200).end('{"ok":true}');
    expect(
      (await sendRequest({ method: 'GET', url: origin, responseType: 'text' }))
        .data
    ).toBe('{"ok":true}');
  });

  it.each([
    ['gzip', zlib.gzipSync],
    ['deflate', zlib.deflateSync],
    ['deflate', zlib.deflateRawSync],
    ['br', zlib.brotliCompressSync],
  ])(
    'decompresses a %s body and drops content-encoding',
    async (encoding, compress) => {
      handler = (_req, res) =>
        res
          .writeHead(200, { 'content-encoding': encoding, 'x-a': 'b' })
          .end(compress(Buffer.from('{"ok":true}')));

      const response = await sendRequest({ method: 'GET', url: origin });

      expect(response.data).toEqual({ ok: true });
      expect(response.headers['content-encoding']).toBeUndefined();
      expect(response.headers['x-a']).toBe('b');
    }
  );

  it('keeps the status line and the order of the headers of the response', async () => {
    handler = (_req, res) => {
      res.statusMessage = 'Fine';
      res.setHeader('x-b', '1');
      res.setHeader('set-cookie', ['a=1', 'b=2']);
      res.setHeader('x-a', '2');
      res.writeHead(201).end();
    };

    const response = await sendRequest({ method: 'GET', url: origin });

    expect(response.status).toBe(201);
    expect(response.statusText).toBe('Fine');
    expect(Object.keys(response.headers).slice(0, 3)).toEqual([
      'x-b',
      'set-cookie',
      'x-a',
    ]);
    expect(response.headers['set-cookie']).toEqual(['a=1', 'b=2']);
  });

  it.each([
    [404, 'ERR_BAD_REQUEST'],
    [503, 'ERR_BAD_RESPONSE'],
  ])(
    'fails on %d with the message and the code of axios',
    async (status, code) => {
      handler = json(status, { error: 'no' });

      const error = await sendRequest({
        method: 'PUT',
        url: `${origin}/x`,
        body: 'data',
      }).catch((e) => e);

      expect(error).toBeInstanceOf(HttpError);
      expect(error).toMatchObject({
        message: `Request failed with status code ${status}`,
        code,
        status,
        config: { method: 'put', url: `${origin}/x`, data: 'data' },
        response: { status, data: { error: 'no' } },
      });
    }
  );

  it('sends a POST again with its body after a 307', async () => {
    handler = (req, res) =>
      req.url === '/first'
        ? res.writeHead(307, { location: '/second' }).end()
        : json(200, { ok: true })(req, res);

    const response = await sendRequest({
      method: 'POST',
      url: `${origin}/first`,
      body: Buffer.from('payload'),
      headers: { 'content-encoding': 'gzip', authorization: 'Bearer k' },
    });

    expect(response.data).toEqual({ ok: true });
    expect(received.map((r) => [r.method, r.url, r.body])).toEqual([
      ['POST', '/first', 'payload'],
      ['POST', '/second', 'payload'],
    ]);
    expect(received[1].headers).toMatchObject({
      'content-encoding': 'gzip',
      authorization: 'Bearer k',
    });
  });

  it.each([302, 303])(
    'turns a POST into a GET without a body after a %d',
    async (status) => {
      handler = (req, res) =>
        req.url === '/first'
          ? res.writeHead(status, { location: '/second' }).end()
          : res.writeHead(200).end();

      await sendRequest({
        method: 'POST',
        url: `${origin}/first`,
        body: '{"a":1}',
        headers: { 'content-type': 'application/json' },
      });

      expect(received[1]).toMatchObject({ method: 'GET', body: '' });
      expect(received[1].headers['content-type']).toBeUndefined();
    }
  );

  it('drops the authorization header on a redirect to another host', async () => {
    handler = (req, res) =>
      req.url === '/first'
        ? res
            .writeHead(307, { location: `http://localhost:${port}/second` })
            .end()
        : res.writeHead(200).end();

    await sendRequest({
      method: 'GET',
      url: `${origin}/first`,
      headers: { authorization: 'Bearer k', 'x-currents-key': 'rk' },
    });

    expect(received[1].headers.authorization).toBeUndefined();
    expect(received[1].headers['x-currents-key']).toBe('rk');
  });

  it('does not follow a redirect with a stream body', async () => {
    handler = (_req, res) => res.writeHead(307, { location: '/second' }).end();

    await expect(
      sendRequest({
        method: 'PUT',
        url: `${origin}/first`,
        body: Readable.from([Buffer.from('abc')]),
        headers: { 'content-length': '3' },
      })
    ).rejects.toMatchObject({
      message: 'Request failed with status code 307',
    });
    expect(received).toHaveLength(1);
  });

  it('times out the whole request as axios did', async () => {
    handler = () => {};

    await expect(
      sendRequest({ method: 'GET', url: origin, timeout: 50 })
    ).rejects.toMatchObject({
      message: 'timeout of 50ms exceeded',
      code: 'ETIMEDOUT',
    });
  });

  it('reports a connection closed without an answer as axios did', async () => {
    await expect(
      sendRequest({ method: 'GET', url: `${origin}/drop` })
    ).rejects.toMatchObject({ message: 'socket hang up', code: 'ECONNRESET' });
  });

  it('reports a refused connection as axios did', async () => {
    await expect(
      sendRequest({ method: 'GET', url: 'http://127.0.0.1:1' })
    ).rejects.toMatchObject({
      message: 'connect ECONNREFUSED 127.0.0.1:1',
      code: 'ECONNREFUSED',
    });
  });

  describe('with HTTP_PROXY', () => {
    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it('sends the request to the proxy with the full URL and the credentials of the proxy', async () => {
      vi.stubEnv('HTTP_PROXY', `http://user:p%40ss@127.0.0.1:${port}`);
      vi.stubEnv('NO_PROXY', undefined);
      vi.stubEnv('no_proxy', undefined);

      await sendRequest({ method: 'GET', url: 'http://api.example/v1/runs' });

      expect(received[0].url).toBe('http://api.example/v1/runs');
      expect(received[0].headers.host).toBe('api.example');
      expect(received[0].headers['proxy-authorization']).toBe(
        `Basic ${Buffer.from('user:p@ss').toString('base64')}`
      );
    });

    it('sends the request directly to a host of NO_PROXY', async () => {
      vi.stubEnv('HTTP_PROXY', 'http://127.0.0.1:1');
      vi.stubEnv('NO_PROXY', '127.0.0.1');

      await sendRequest({ method: 'GET', url: `${origin}/direct` });

      expect(received[0].url).toBe('/direct');
    });
  });
});
