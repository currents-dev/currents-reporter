import http from 'http';
import { AddressInfo } from 'net';
import { setTimeout as sleep } from 'timers/promises';
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { error, warn } from '../../logger';
import { sendBuffer } from '../storage';

vi.mock('../../logger');
vi.mock('timers/promises', () => ({ setTimeout: vi.fn(async () => {}) }));

let server: http.Server;
let origin: string;
let answers: number[] = [];
let requests = 0;

beforeAll(async () => {
  server = http.createServer((req, res) => {
    req.resume();
    req.on('end', () => {
      requests++;
      const status = answers.shift() ?? 200;
      res
        .writeHead(status, { 'content-type': 'application/xml' })
        .end(`<Error><Code>Code${status}</Code><Message>m</Message></Error>`);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => {
  server.close();
});

afterEach(() => {
  answers = [];
  requests = 0;
  vi.restoreAllMocks();
  vi.mocked(warn).mockReset();
  vi.mocked(error).mockReset();
  vi.mocked(sleep).mockClear();
});

const send = () =>
  sendBuffer(
    {
      name: 'meta',
      buffer: Buffer.from('{}'),
      uploadUrl: `${origin}/put`,
      contentType: 'application/json',
    },
    'application/json',
    undefined
  );

describe('retries of an upload', () => {
  it('tries six times, with the messages and the waits of async-retry', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    answers = [500, 500, 500, 500, 500, 500];

    await expect(send()).rejects.toThrow('storage answered 500 Code500: m');

    expect(requests).toBe(6);
    expect(vi.mocked(sleep).mock.calls.map(([ms]) => ms)).toEqual([
      1500, 3000, 6000, 12000, 24000,
    ]);
    expect(vi.mocked(warn).mock.calls).toEqual(
      [1, 2, 3, 4].map((n) => [
        `Upload failed ${n} out of 5 attempts: Request failed with status code 500`,
      ])
    );
    expect(vi.mocked(error).mock.calls).toEqual([
      ['Cannot upload after 5 times: Request failed with status code 500'],
    ]);
  });

  it('waits between 1 and 2 times 1, 2, 4, 8 and 16 seconds', async () => {
    answers = [500, 500, 500, 500, 500];

    await send();

    const waits = vi.mocked(sleep).mock.calls.map(([ms]) => ms as number);
    [1000, 2000, 4000, 8000, 16000].forEach((min, i) => {
      expect(waits[i]).toBeGreaterThanOrEqual(min);
      expect(waits[i]).toBeLessThanOrEqual(min * 2);
    });
  });

  it('fails with the error of most attempts, the latest of a tie', async () => {
    answers = [500, 500, 500, 500, 500, 503];
    await expect(send()).rejects.toThrow('storage answered 500');

    answers = [500, 500, 500, 503, 503, 503];
    await expect(send()).rejects.toThrow('storage answered 503');
  });
});
