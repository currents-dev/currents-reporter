import fs from 'fs-extra';
import http from 'http';
import { AddressInfo } from 'net';
import os from 'os';
import path from 'path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getUploadTimeoutMs, sendFile } from '../storage';

let server: http.Server;
let origin: string;
const answers: Array<{ status: number; body?: string }> = [];
const received: Buffer[] = [];

beforeAll(async () => {
  server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      received.push(Buffer.concat(chunks));
      const answer = answers.shift() ?? { status: 200 };
      res.writeHead(answer.status).end(answer.body);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => {
  server.close();
});

const upload = async (content: string) => {
  const file = path.join(
    await fs.mkdtemp(path.join(os.tmpdir(), 'st-')),
    'a.txt'
  );
  await fs.writeFile(file, content);
  return {
    name: 'a.txt',
    path: file,
    sizeBytes: Buffer.byteLength(content),
    uploadUrl: `${origin}/put`,
    contentType: 'text/plain',
  };
};

describe('sendFile', () => {
  it('does not retry a 403 and reports storage error code', async () => {
    received.length = 0;
    answers.push({
      status: 403,
      body: '<Error><Code>AccessDenied</Code><Message>Request has expired</Message></Error>',
    });
    await expect(sendFile(await upload('hello'))).rejects.toThrow(
      'storage answered 403 AccessDenied: Request has expired'
    );
    expect(received).toHaveLength(1);
  });

  it('opens the file again when it retries a 500', async () => {
    received.length = 0;
    answers.push({ status: 500 });
    await sendFile(await upload('hello'));
    expect(received.map((b) => b.toString())).toEqual(['hello', 'hello']);
  });

  it('retries a 400 with a transient S3 code', async () => {
    received.length = 0;
    answers.push({
      status: 400,
      body: '<Error><Code>RequestTimeout</Code><Message>Socket was not read from</Message></Error>',
    });
    await sendFile(await upload('hello'));
    expect(received).toHaveLength(2);
  });

  it('sends the size it declared when the file grew after it was measured', async () => {
    received.length = 0;
    const file = await upload('hello');
    await fs.appendFile(file.path, ' and more');
    await sendFile(file);
    expect(received.map((b) => b.toString())).toEqual(['hello']);
  });
});

describe('getUploadTimeoutMs', () => {
  it('allows more time for a bigger file', () => {
    expect(getUploadTimeoutMs(0)).toBe(120000);
    expect(getUploadTimeoutMs(1024 * 1024 * 1024)).toBe(120000 + 4096 * 1000);
  });
});
