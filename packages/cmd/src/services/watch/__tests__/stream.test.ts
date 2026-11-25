import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  readRunStream,
  RunStreamRefused,
  type RunStreamEvent,
} from '../stream';

const mocks = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock('undici', async (importOriginal) => ({
  ...(await importOriginal<typeof import('undici')>()),
  fetch: mocks.fetch,
}));
vi.mock('../../../http/httpConfig', () => ({
  requireRestAPIBaseUrl: () => 'https://api.example.test',
}));

const body = (...chunks: string[]) =>
  (async function* () {
    for (const chunk of chunks) yield new TextEncoder().encode(chunk);
  })();

beforeEach(() => mocks.fetch.mockReset());

describe('readRunStream', () => {
  it('parses events split across chunks and skips heartbeats', async () => {
    mocks.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      body: body(
        'event: snapshot\ndata: {"status":"RUNNING","completionState":"IN_PRO',
        'GRESS","records":[]}\n\n: heartbeat\n\n',
        'event: runEnd\ndata: {"status":"PASSED","completionState":"COMPLETE"}\n\n'
      ),
    });
    const events: RunStreamEvent[] = [];
    await readRunStream('key', 'run/1', (e) => events.push(e));
    expect(events).toEqual([
      {
        event: 'snapshot',
        data: {
          status: 'RUNNING',
          completionState: 'IN_PROGRESS',
          records: [],
        },
      },
      {
        event: 'runEnd',
        data: { status: 'PASSED', completionState: 'COMPLETE' },
      },
    ]);
    const [url, init] = mocks.fetch.mock.calls[0];
    expect(String(url)).toBe('https://api.example.test/stream/runs/run%2F1');
    expect(init.headers).toMatchObject({ Authorization: 'Bearer key' });
  });

  it.each([
    [404, RunStreamRefused],
    [401, RunStreamRefused],
    [429, Error],
    [503, Error],
  ])('answers %d with %o', async (status, type) => {
    mocks.fetch.mockResolvedValue({
      ok: false,
      status,
      body: null,
      text: async () => '{"message":"no"}',
    });
    const error = await readRunStream('key', 'run1', () => {}).catch((e) => e);
    expect(error).toBeInstanceOf(type);
    expect(error.constructor === RunStreamRefused).toBe(
      type === RunStreamRefused
    );
  });
});
