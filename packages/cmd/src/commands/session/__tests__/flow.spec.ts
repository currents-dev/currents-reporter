import fs from 'fs-extra';
import http from 'http';
import { AddressInfo } from 'net';
import os from 'os';
import path from 'path';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

type Recorded = {
  method: string;
  url: string;
  headers: http.IncomingHttpHeaders;
  body: Buffer;
};

const requests: Recorded[] = [];
let server: http.Server;
let origin: string;

// Answers the way CONTRACT.md describes, with signed URLs that point back here.
function respond(req: Recorded, res: http.ServerResponse) {
  const json = (data: unknown, status = 200) => {
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(JSON.stringify(status === 200 ? { status: 'OK', data } : data));
  };
  if (req.method === 'PUT') {
    if (req.url?.includes('bad')) {
      return res
        .writeHead(403)
        .end(
          '<Error><Code>AccessDenied</Code><Message>Request has expired</Message></Error>'
        );
    }
    return res.writeHead(200).end();
  }
  const body = req.body.length ? JSON.parse(req.body.toString()) : {};
  if (req.url === '/v1/sessions') {
    return json({ sessionId: 'sess1', attachments: [] });
  }
  if (
    req.url === '/v1/sessions/sess1/attachments' ||
    req.url === '/v1/runs/attachments'
  ) {
    return json({
      uploadExpiresInSeconds: 600,
      attachments: body.attachments.map(
        (f: { name: string; contentType: string }, i: number) => ({
          attachmentId: `a${i}`,
          name: f.name,
          type: 'x',
          uploadUrl: `${origin}/upload/${f.name}`,
          uploadHeaders: { 'Content-Type': f.contentType },
        })
      ),
    });
  }
  if (req.url === '/v1/share') {
    return json({
      purpose: 'report',
      url: 'https://share/x.md',
      pageUrl: 'https://share/x',
      expiresAt: '2026-10-09T00:00:00Z',
    });
  }
  return json({ status: 'FAILED', error: 'Not found' }, 404);
}

beforeAll(async () => {
  server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const recorded = {
        method: req.method ?? '',
        url: req.url ?? '',
        headers: req.headers,
        body: Buffer.concat(chunks),
      };
      requests.push(recorded);
      respond(recorded, res);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  // Read when the first request is made.
  process.env.CURRENTS_REST_API_URL = origin;
});

afterAll(() => {
  server.close();
});

describe('session and run attach against a server', () => {
  let dir: string;

  beforeEach(async () => {
    requests.length = 0;
    for (const key of [
      'CURRENTS_API_KEY',
      'CURRENTS_RECORD_KEY',
      'CURRENTS_PROJECT_ID',
      'CURRENTS_SESSION_ID',
      'CURRENTS_CI_BUILD_ID',
    ]) {
      vi.stubEnv(key, undefined);
    }
    vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'flow-'));
    process.chdir(dir);
  });

  it('sends the requests CONTRACT.md describes for start, attach and share', async () => {
    const { getSessionCommand } = await import('../index');
    const run = (args: string[]) =>
      getSessionCommand('currents').parseAsync(args, { from: 'user' });

    await fs.outputFile('before.png', 'png-bytes');
    await fs.outputFile('traces/trace-1.trace', '{"type":"context-options"}\n');

    await run([
      'start',
      '--api-key',
      'key-1',
      '-p',
      'proj',
      '--title',
      'Bug',
      '--status',
      'failed',
      '--error',
      'boom',
      '--pr',
      '7',
    ]);
    await run([
      'attach',
      '--api-key',
      'key-1',
      '--caption',
      'before',
      '--meta',
      'step=1',
      'before.png',
      'traces',
    ]);
    await run(['share', '--api-key', 'key-1', '--expires-in-days', '7']);

    // The uploads run side by side, so their order is not fixed.
    const [start, files] = requests;
    const share = requests[requests.length - 1];
    const putPng = requests.find((r) => r.url === '/upload/before.png')!;
    const putTrace = requests.find((r) => r.url.startsWith('/upload/trace-'))!;
    expect(requests).toHaveLength(5);

    expect(start.method).toBe('POST');
    expect(start.url).toBe('/v1/sessions');
    expect(start.headers.authorization).toBe('Bearer key-1');
    expect(JSON.parse(start.body.toString())).toMatchObject({
      projectId: 'proj',
      title: 'Bug',
      status: 'failed',
      error: 'boom',
      pr: { id: '7' },
      ci: { params: expect.anything() },
    });
    expect(JSON.parse(start.body.toString())).not.toHaveProperty('ciBuildId');

    expect(files.url).toBe('/v1/sessions/sess1/attachments');
    const filesBody = JSON.parse(files.body.toString());
    expect(Object.keys(filesBody)).toEqual(['attachments']);
    expect(filesBody.attachments).toEqual([
      {
        name: 'before.png',
        type: 'screenshot',
        contentType: 'image/png',
        sizeBytes: 9,
        caption: 'before',
        meta: { step: '1' },
      },
      {
        name: expect.stringMatching(/^trace-\w{8}\.zip$/),
        type: 'trace',
        contentType: 'application/zip',
        sizeBytes: expect.any(Number),
        caption: 'before',
        meta: { step: '1' },
      },
    ]);

    // Uploads: the declared size and exactly the headers the API returned.
    for (const [put, declared] of [
      [putPng, filesBody.attachments[0]],
      [putTrace, filesBody.attachments[1]],
    ] as const) {
      expect(put.method).toBe('PUT');
      expect(put.body.length).toBe(declared.sizeBytes);
      expect(put.headers['content-type']).toBe(declared.contentType);
      expect(put.headers['content-disposition']).toBeUndefined();
    }
    expect(putPng.url).toBe('/upload/before.png');
    expect(putTrace.body.subarray(0, 2).toString()).toBe('PK');

    expect(share.url).toBe('/v1/share');
    expect(JSON.parse(share.body.toString())).toEqual({
      sessionId: 'sess1',
      purpose: 'report',
      expiresInDays: 7,
    });
    expect(console.log).toHaveBeenCalledWith('https://share/x');
  });

  it('sends a record key and a machine ID for run attach', async () => {
    const { getRunFilesCommand } = await import('../../run');
    await fs.outputFile('docker.zip', 'zip-bytes');

    await getRunFilesCommand('currents').parseAsync(
      [
        'attach',
        '--key',
        'rk-1',
        '-p',
        'proj',
        '--ci-build-id',
        'build-1',
        '--machine-id',
        'shard-1',
        'docker.zip',
      ],
      { from: 'user' }
    );

    const [files, put] = requests;
    expect(files.url).toBe('/v1/runs/attachments');
    expect(files.headers['x-currents-key']).toBe('rk-1');
    expect(files.headers.authorization).toBeUndefined();
    expect(JSON.parse(files.body.toString())).toEqual({
      projectId: 'proj',
      ciBuildId: 'build-1',
      machineId: 'shard-1',
      attachments: [
        {
          name: 'docker.zip',
          type: 'attachment',
          contentType: 'application/zip',
          sizeBytes: 9,
        },
      ],
    });
    expect(put.body.toString()).toBe('zip-bytes');
  });

  it('declares more than 50 files in several requests', async () => {
    const { getSessionCommand } = await import('../index');
    for (let i = 0; i < 120; i++) {
      await fs.outputFile(
        `many/f${String(i).padStart(3, '0')}.txt`,
        `file ${i}`
      );
    }
    await getSessionCommand('currents').parseAsync(
      ['attach', '--api-key', 'k', '--session-id', 'sess1', 'many'],
      { from: 'user' }
    );
    const declares = requests.filter(
      (r) => r.url === '/v1/sessions/sess1/attachments'
    );
    expect(
      declares.map((r) => JSON.parse(r.body.toString()).attachments.length)
    ).toEqual([50, 50, 20]);
    expect(requests.filter((r) => r.method === 'PUT')).toHaveLength(120);
  });

  it('names the file that failed to upload and still sends the others', async () => {
    const { getSessionCommand } = await import('../index');
    const errors = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    await fs.outputFile('two/bad.txt', 'x');
    await fs.outputFile('two/good.txt', 'y');
    await getSessionCommand('currents').parseAsync(
      ['attach', '--api-key', 'k', '--session-id', 'sess1', 'two'],
      { from: 'user' }
    );
    const output = errors.mock.calls.flat().join('\n');
    expect(output).toContain(
      'Failed bad.txt: storage answered 403 AccessDenied: Request has expired'
    );
    expect(output).toContain('1 of 2 files could not be uploaded');
    expect(requests.filter((r) => r.url === '/upload/bad.txt')).toHaveLength(1);
    expect(requests.some((r) => r.url === '/upload/good.txt')).toBe(true);
    expect(process.exit).toHaveBeenCalledWith(1);
  });
});
