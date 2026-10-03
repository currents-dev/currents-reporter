import fs from 'fs-extra';
import http from 'http';
import { AddressInfo } from 'net';
import os from 'os';
import path from 'path';
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
import { getProgram } from '../program';

// No retries, so that a dropped connection fails at once.
vi.mock('../../http/httpRetry', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../http/httpRetry')>()),
  getMaxRetries: () => 0,
}));

class ExitError extends Error {
  constructor(public code: number | undefined) {
    super(`exit ${code}`);
  }
}

type Received = {
  method?: string;
  url?: string;
  headers: http.IncomingHttpHeaders;
  body: string;
};

describe('currents api', () => {
  let server: http.Server;
  let received: Received[];
  let stdout: string;
  let stderr: string;

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      let body = '';
      req.on('data', (chunk) => (body += chunk));
      req.on('end', () => {
        received.push({
          method: req.method,
          url: req.url,
          headers: req.headers,
          body,
        });
        if (req.url?.startsWith('/v1/drop')) {
          req.socket.destroy();
          return;
        }
        if (req.url?.startsWith('/v1/runs/missing')) {
          res.writeHead(404, { 'content-type': 'application/json' });
          res.end('{"status":"FAILED","message":"Run not found"}');
          return;
        }
        if (req.url?.startsWith('/v1/runs/find')) {
          res.writeHead(200, { 'content-type': 'application/json' });
          res.end('{"status":"OK","data":{"runId":"r1"}}');
          return;
        }
        res.writeHead(200, {
          'content-type': 'application/json',
          'x-request-id': 'req-1',
        });
        res.end('{"status":"OK","data":{"runId":"r1"}}');
      });
    });
    await new Promise<void>((resolve) =>
      server.listen(0, '127.0.0.1', resolve)
    );
    const { port } = server.address() as AddressInfo;
    vi.stubEnv('CURRENTS_REST_API_URL', `http://127.0.0.1:${port}`);
  });

  afterAll(async () => {
    vi.unstubAllEnvs();
    await new Promise((resolve) => server.close(resolve));
  });

  beforeEach(() => {
    received = [];
    stdout = '';
    stderr = '';
    vi.stubEnv('CURRENTS_API_KEY', 'env-key');
    vi.stubEnv('CURRENTS_DEBUG', undefined);
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      stdout += String(chunk);
      return true;
    });
    vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
      stderr += String(chunk);
      return true;
    });
    vi.spyOn(console, 'log').mockImplementation((...args) => {
      stdout += args.join(' ') + '\n';
    });
    vi.spyOn(console, 'error').mockImplementation((...args) => {
      stderr += args.join(' ') + '\n';
    });
    vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new ExitError(code);
    }) as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // commandHandler catches the error thrown by the mocked process.exit(0) and
  // exits again with 1, so the first call is the result.
  const api = async (...args: string[]) => {
    try {
      await getProgram().parseAsync(['api', ...args], { from: 'user' });
    } catch (e) {
      if (!(e instanceof ExitError)) throw e;
    }
    return vi.mocked(process.exit).mock.calls[0]?.[0];
  };

  it.each(['/v1/runs/r1', 'v1/runs/r1', 'runs/r1', '/runs/r1'])(
    'sends a GET to /v1/runs/r1 for the path %s',
    async (route) => {
      expect(await api(route)).toBe(0);

      expect(received).toEqual([
        expect.objectContaining({ method: 'GET', url: '/v1/runs/r1' }),
      ]);
      expect(received[0].headers.authorization).toBe('Bearer env-key');
      expect(stdout).toBe('{"status":"OK","data":{"runId":"r1"}}');
    }
  );

  it.each([
    '../health',
    'v1/../health',
    'runs/./r1',
    '%2e%2e/health',
    'v1/%2E/x',
  ])('refuses the dot segments in %s', async (route) => {
    expect(await api(route)).toBe(1);

    expect(received).toEqual([]);
    expect(stderr).toContain('cannot hold "." or ".." segments');
  });

  it('refuses a full URL', async () => {
    expect(await api('https://example.com/v1/runs/r1')).toBe(1);

    expect(received).toEqual([]);
    expect(stderr).toContain(
      'Pass a path such as /v1/runs/<run-id>, not a URL'
    );
  });

  it('sends the fields of a GET as query parameters', async () => {
    expect(
      await api(
        '/v1/projects/p1/runs',
        '-X',
        'get',
        '-f',
        'branches[]=main',
        '-f',
        'status=FAILED',
        '-f',
        'status=FAILING',
        '-f',
        'limit=20'
      )
    ).toBe(0);

    expect(received[0].method).toBe('GET');
    expect(received[0].url).toBe(
      '/v1/projects/p1/runs?branches%5B%5D=main&status=FAILED&status=FAILING&limit=20'
    );
  });

  it('sends typed fields as a JSON body with POST by default', async () => {
    expect(
      await api(
        '/v1/webhooks',
        '-f',
        'limit=20',
        '-f',
        'enabled=true',
        '-f',
        'label=null',
        '-f',
        'events[]=RUN_FINISH',
        '-f',
        'events[]=RUN_CANCELED',
        '-F',
        'name=42'
      )
    ).toBe(0);

    expect(received[0].method).toBe('POST');
    expect(received[0].headers['content-type']).toBe('application/json');
    expect(JSON.parse(received[0].body)).toEqual({
      limit: 20,
      enabled: true,
      label: null,
      events: ['RUN_FINISH', 'RUN_CANCELED'],
      name: '42',
    });
  });

  it('uses the method given with -X', async () => {
    expect(await api('/v1/runs/r1/cancel', '-X', 'PUT')).toBe(0);

    expect(received[0]).toMatchObject({
      method: 'PUT',
      url: '/v1/runs/r1/cancel',
    });
  });

  it('refuses a method it does not know', async () => {
    expect(await api('/v1/runs/r1', '-X', 'FETCH')).toBe(1);

    expect(received).toEqual([]);
    expect(stderr).toContain('Use one of GET, POST, PUT, PATCH, DELETE, HEAD');
  });

  it('sends the JSON of --input as the body and the fields as query parameters', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'api-input-'));
    const file = path.join(dir, 'webhook.json');
    await fs.writeJson(file, { url: 'https://example.com/hook' });

    expect(
      await api('/v1/webhooks', '-F', 'projectId=p1', '--input', file)
    ).toBe(0);

    expect(received[0]).toMatchObject({
      method: 'POST',
      url: '/v1/webhooks?projectId=p1',
    });
    expect(JSON.parse(received[0].body)).toEqual({
      url: 'https://example.com/hook',
    });
    await fs.remove(dir);
  });

  it('fails when --input is not JSON', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'api-input-'));
    const file = path.join(dir, 'body.json');
    await fs.writeFile(file, 'not json');

    expect(await api('/v1/webhooks', '--input', file)).toBe(1);

    expect(received).toEqual([]);
    expect(stderr).toContain(`--input ${file} is not valid JSON`);
    await fs.remove(dir);
  });

  it('sends the headers given with -H', async () => {
    expect(
      await api('/v1/runs/r1', '-H', 'x-currents-tz: Europe/Paris', '-H', 'a:b')
    ).toBe(0);

    expect(received[0].headers['x-currents-tz']).toBe('Europe/Paris');
    expect(received[0].headers.a).toBe('b');
  });

  it.each([' =v', '=v'])(
    'refuses a field without a name: %s',
    async (field) => {
      expect(await api('/v1/runs/r1', '-f', field)).toBe(1);

      expect(received).toEqual([]);
      expect(stderr).toContain('Expected key=value');
    }
  );

  it('sends a field value as written and trims a header value', async () => {
    expect(
      await api('/v1/webhooks', '-F', 'name= padded ', '-H', 'x-a:  b ')
    ).toBe(0);

    expect(JSON.parse(received[0].body)).toEqual({ name: ' padded ' });
    expect(received[0].headers['x-a']).toBe('b');
  });

  it('keeps __proto__ as a field of the JSON body', async () => {
    expect(
      await api('/v1/webhooks', '-f', '__proto__=x', '-f', 'list[]=a')
    ).toBe(0);

    expect(received[0].body).toBe('{"__proto__":"x","list":["a"]}');
  });

  it('keeps an integer JSON cannot hold exactly as a string', async () => {
    expect(
      await api('/v1/webhooks', '-f', 'big=9007199254740993', '-f', 'n=1.5')
    ).toBe(0);

    expect(JSON.parse(received[0].body)).toEqual({
      big: '9007199254740993',
      n: 1.5,
    });
  });

  it('prints the help for api help instead of requesting /v1/help', async () => {
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    expect(await api('help')).toBe(0);

    expect(received).toEqual([]);
  });

  it('refuses a header without a colon', async () => {
    expect(await api('/v1/runs/r1', '-H', 'x-currents-tz')).toBe(1);

    expect(stderr).toContain('Expected key:value');
  });

  it('prints the status line and headers before the body with -i', async () => {
    expect(await api('/v1/runs/r1', '-i')).toBe(0);

    expect(stdout).toMatch(/^HTTP\/1\.1 200 OK\n/);
    expect(stdout).toContain('x-request-id: req-1\n');
    expect(stdout).toMatch(/\n\n\{"status":"OK","data":\{"runId":"r1"\}\}$/);
  });

  it('indents JSON when stdout is a terminal', async () => {
    Object.defineProperty(process.stdout, 'isTTY', {
      value: true,
      configurable: true,
    });

    try {
      expect(await api('/v1/runs/r1')).toBe(0);
    } finally {
      delete (process.stdout as { isTTY?: boolean }).isTTY;
    }

    expect(stdout).toBe(
      JSON.stringify({ status: 'OK', data: { runId: 'r1' } }, null, 2) + '\n'
    );
  });

  it('prints the body of a 404 on stderr and exits with 1', async () => {
    expect(await api('/v1/runs/missing')).toBe(1);

    expect(stdout).toBe('');
    expect(stderr).toContain('{"status":"FAILED","message":"Run not found"}');
    expect(stderr).toContain(
      'GET v1/runs/missing failed: the REST API answered 404 Not Found'
    );
  });

  it('exits with 1 when the connection drops', async () => {
    expect(await api('/v1/drop')).toBe(1);

    expect(stdout).toBe('');
    expect(stderr).toContain(
      'Could not reach the REST API at http://127.0.0.1'
    );
  });

  it('prefers --api-key over CURRENTS_API_KEY', async () => {
    expect(await api('/v1/runs/r1', '--api-key', 'cli-key')).toBe(0);

    expect(received[0].headers.authorization).toBe('Bearer cli-key');
  });

  it('fails without an API key', async () => {
    vi.stubEnv('CURRENTS_API_KEY', undefined);

    expect(await api('/v1/runs/r1')).toBe(1);

    expect(received).toEqual([]);
    expect(stderr).toContain('API key is required');
  });

  it('hides the API key in the debug output', async () => {
    const debugOutput: string[] = [];
    vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
      debugOutput.push(String(chunk));
      return true;
    });

    expect(await api('/v1/runs/r1', '--api-key', 'secret-key', '--debug')).toBe(
      0
    );

    expect(debugOutput.join('')).not.toContain('secret-key');
    expect(debugOutput.join('')).toContain('Bearer ***');
  });

  it('runs the hidden get-run command instead of requesting the path get-run', async () => {
    expect(
      await api(
        'get-run',
        '--api-key',
        'cli-key',
        '--project-id',
        'p1',
        '--ci-build-id',
        'b1'
      )
    ).toBe(0);

    expect(received).toHaveLength(1);
    expect(received[0].url).toMatch(/^\/v1\/runs\/find\?/);
    expect(received[0].url).toContain('ciBuildId=b1');
    expect(received[0].headers.authorization).toBe('Bearer cli-key');
    expect(JSON.parse(stdout)).toEqual({ runId: 'r1' });
  });
});
