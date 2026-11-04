import fs from 'fs-extra';
import http from 'http';
import { AddressInfo, connect } from 'net';
import os from 'os';
import { join } from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  ApiServer,
  RecordedRequest,
  startApiServer,
} from '../../test-utils/api-server';
import { runCli } from '../../test-utils/cli';
import { createTestCertificate } from '../../test-utils/tls';

const tls = createTestCertificate(['api.test', 'storage.test']);

type Tunnel = { target: string; auth?: string };

// Answers CONNECT only. The .test names resolve here and nowhere else, so a
// request to api.test that arrives went through the proxy.
async function startProxy() {
  const tunnels: Tunnel[] = [];
  const server = http.createServer((_req, res) => res.writeHead(405).end());
  server.on('connect', (req, socket, head) => {
    tunnels.push({
      target: req.url ?? '',
      auth: req.headers['proxy-authorization'],
    });
    const [host, port] = (req.url ?? '').split(':');
    const upstream = connect(
      Number(port),
      host.endsWith('.test') ? '127.0.0.1' : host,
      () => {
        socket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
        upstream.write(head);
        upstream.pipe(socket).pipe(upstream);
      }
    );
    upstream.on('error', () => socket.destroy());
    socket.on('error', () => upstream.destroy());
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    tunnels,
    close: () => {
      server.close();
      server.closeAllConnections();
    },
  };
}

// Each test starts the CLI twice and opens TLS connections through the proxy.
describe('the built CLI behind an HTTPS proxy', { timeout: 15_000 }, () => {
  let api: ApiServer;
  let proxy: Awaited<ReturnType<typeof startProxy>>;
  let workDir: string;
  let apiUrl: string;
  let storageUrl: string;
  const stored = new Map<string, Buffer>();

  function respond({ method, url, body, json }: RecordedRequest) {
    const path = url.split('?')[0];
    if (method === 'PUT' && path.startsWith('/storage/')) {
      stored.set(path, body);
      return { status: 200 };
    }
    if (method === 'GET' && path.startsWith('/storage/')) {
      return { status: 200, body: stored.get(path) ?? '' };
    }
    if (url === '/cache/upload') {
      return {
        status: 200,
        json: {
          cacheId: 'cache-1',
          orgId: 'org-1',
          uploadUrl: `${storageUrl}/storage/archive?X-Amz-Signature=s`,
          metaUploadUrl: `${storageUrl}/storage/meta?X-Amz-Signature=s`,
          refMetaUploadUrl: `${storageUrl}/storage/ref-meta?X-Amz-Signature=s`,
          cacheKey: 'cache-key',
          metaCacheKey: 'meta-cache-key',
        },
      };
    }
    if (url === '/cache/meta') {
      return {
        status: 200,
        json: {
          cacheId: 'cache-1',
          orgId: 'org-1',
          refMetaReadUrl: `${storageUrl}/storage/ref-meta?X-Amz-Signature=s`,
        },
      };
    }
    if (url === '/cache/v2/download') {
      return {
        status: 200,
        json: {
          orgId: 'org-1',
          readUrl: `${storageUrl}/storage/archive?X-Amz-Signature=s`,
        },
      };
    }
    if (url === '/v1/sessions') {
      return { status: 200, json: { status: 'OK', data: { sessionId: 's1' } } };
    }
    if (url === '/v1/sessions/s1/attachments') {
      return {
        status: 200,
        json: {
          status: 'OK',
          data: {
            uploadExpiresInSeconds: 600,
            attachments: json.attachments.map(
              (file: { name: string; contentType: string }, i: number) => ({
                attachmentId: `a${i}`,
                name: file.name,
                type: 'attachment',
                uploadUrl: `${storageUrl}/storage/${file.name}?X-Amz-Signature=s`,
                uploadHeaders: { 'Content-Type': file.contentType },
              })
            ),
          },
        },
      };
    }
    return { status: 404, json: { status: 'FAILED', error: 'Not found' } };
  }

  beforeEach(async () => {
    stored.clear();
    workDir = await fs.mkdtemp(join(os.tmpdir(), 'currents-proxy-'));
    await fs.writeFile(join(workDir, 'cached.txt'), 'cached');
    // The CLI trusts the certificate of the fake API through this file.
    await fs.writeFile(join(workDir, 'ca.pem'), tls.cert);
    await fs.writeFile(join(workDir, 'notes.txt'), 'x'.repeat(100_000));
    api = await startApiServer(respond, tls);
    proxy = await startProxy();
    const { port } = new URL(api.url);
    apiUrl = `https://api.test:${port}`;
    storageUrl = `https://storage.test:${port}`;
  });

  afterEach(async () => {
    proxy.close();
    await api.close();
    await fs.remove(workDir);
  });

  const run = (args: string[], env: Record<string, string>) =>
    runCli(args, {
      cwd: workDir,
      env: {
        NODE_EXTRA_CA_CERTS: join(workDir, 'ca.pem'),
        CURRENTS_API_URL: apiUrl,
        CURRENTS_REST_API_URL: apiUrl,
        ...env,
      },
    });

  const cacheSet = ['cache', 'set', '--key', 'rk', '--id', 'cache-1'];

  it('sends the cache requests and the uploads to storage through the tunnels of HTTPS_PROXY', async () => {
    const env = { HTTPS_PROXY: proxy.url };

    const set = await run([...cacheSet, '--path', 'cached.txt'], env);
    expect(set).toMatchObject({ code: 0 });

    await fs.remove(join(workDir, 'cached.txt'));
    const get = await run(
      ['cache', 'get', '--key', 'rk', '--id', 'cache-1'],
      env
    );
    expect(get).toMatchObject({ code: 0 });
    expect(await fs.readFile(join(workDir, 'cached.txt'), 'utf8')).toBe(
      'cached'
    );

    const targets = new Set(proxy.tunnels.map((t) => t.target));
    expect(targets).toEqual(
      new Set([new URL(apiUrl).host, new URL(storageUrl).host])
    );
    expect(
      api.requests.map((r) => `${r.method} ${r.url.split('?')[0]}`).sort()
    ).toEqual([
      'GET /storage/archive',
      'GET /storage/ref-meta',
      'POST /cache/meta',
      'POST /cache/upload',
      'POST /cache/v2/download',
      'PUT /storage/archive',
      'PUT /storage/meta',
      'PUT /storage/ref-meta',
    ]);
  });

  it('streams a session attachment through the proxy with the headers of the signed URL', async () => {
    const env = { https_proxy: proxy.url, CURRENTS_API_KEY: 'k' };

    expect(
      await run(['session', 'start', '-p', 'project', '--title', 't'], env)
    ).toMatchObject({ code: 0 });
    expect(await run(['session', 'attach', 'notes.txt'], env)).toMatchObject({
      code: 0,
    });

    const upload = api.requests.find((r) => r.method === 'PUT');
    expect(upload?.url).toBe('/storage/notes.txt?X-Amz-Signature=s');
    expect(upload?.body.length).toBe(100_000);
    expect(upload?.headers).toMatchObject({
      'content-type': 'text/plain',
      'content-length': '100000',
    });
    expect(proxy.tunnels.map((t) => t.target)).toContain(
      new URL(storageUrl).host
    );
  });

  it('sends the credentials of the proxy URL, decoded, with CONNECT', async () => {
    const proxyUrl = new URL(proxy.url);
    proxyUrl.username = 'me%40corp';
    proxyUrl.password = 'p%3Ass';

    await run([...cacheSet, '--path', 'cached.txt'], {
      HTTPS_PROXY: proxyUrl.href,
    });

    expect(proxy.tunnels.length).toBeGreaterThan(0);
    for (const tunnel of proxy.tunnels) {
      expect(tunnel.auth).toBe(
        `Basic ${Buffer.from('me@corp:p:ss').toString('base64')}`
      );
    }
  });

  it('connects directly to a host of NO_PROXY', async () => {
    storageUrl = api.url;

    const result = await run([...cacheSet, '--path', 'cached.txt'], {
      HTTPS_PROXY: proxy.url,
      CURRENTS_API_URL: api.url,
      NO_PROXY: 'example.com, localhost',
    });

    expect(result).toMatchObject({ code: 0 });
    expect(proxy.tunnels).toEqual([]);
    expect(api.requests).toHaveLength(4);
  });

  it.each([
    ['127.0.0.0/8', 'https://127.0.0.1'],
    ['127.0.0.1', 'https://localhost'],
    ['localhost', 'https://127.0.0.1'],
  ])(
    'sends API requests directly with NO_PROXY=%s to %s',
    async (noProxy, origin) => {
      const { port } = new URL(api.url);

      const result = await run(
        ['session', 'start', '-p', 'project', '--title', 't'],
        {
          HTTPS_PROXY: proxy.url,
          CURRENTS_REST_API_URL: `${origin}:${port}`,
          CURRENTS_API_KEY: 'k',
          NO_PROXY: noProxy,
        }
      );

      expect(result).toMatchObject({ code: 0 });
      expect(proxy.tunnels).toEqual([]);
      expect(api.requests.map((r) => r.url)).toEqual(['/v1/sessions']);
    }
  );
});
