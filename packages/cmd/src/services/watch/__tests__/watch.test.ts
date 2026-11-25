import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getClient } from '../../../http/client';
import type { TerminalRunEvent } from '../events';
import { runEndStatus, watchRun } from '../index';
import type { TestRecord } from '../records';
import {
  readRunStream,
  RunStreamRefused,
  type RunStreamEvent,
} from '../stream';

vi.mock('../stream', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../stream')>()),
  readRunStream: vi.fn(),
}));
vi.mock('../../../http/client', () => ({
  ClientType: { REST_API: 'restApi' },
  getClient: vi.fn(),
}));

const restRun = {
  data: {
    data: {
      createdAt: '2026-11-25T00:00:00.000Z',
      groups: [{ tests: { total: 2 } }, { tests: { total: 1 } }],
    },
  },
};

const record = (recordId: string, done: boolean): TestRecord => ({
  recordId,
  machineId: 'm',
  project: null,
  spec: 'a.spec.ts',
  title: [recordId],
  done,
  flaky: false,
  attempts: [
    { attempt: 0, parallelIndex: 0, status: 'passed', duration: 1, done },
  ],
});

const running = { status: 'RUNNING', completionState: 'IN_PROGRESS' };

/** Each call of `readRunStream` sends the next list of events, then closes. */
const streams = (...connections: (RunStreamEvent[] | Error)[]) =>
  vi.mocked(readRunStream).mockImplementation(async (_key, _run, onEvent) => {
    const next = connections.shift();
    if (!next) throw new Error('no more connections');
    if (next instanceof Error) throw next;
    next.forEach(onEvent);
  });

const request = vi.fn();
const noSleep = () => Promise.resolve();

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getClient).mockReturnValue({ request } as any);
  request.mockResolvedValue(restRun);
});

describe('watchRun', () => {
  it('reports the records of a run and ends with its status', async () => {
    streams([
      {
        event: 'snapshot',
        data: { ...running, records: [record('a', false)] },
      },
      { event: 'records', data: { records: [record('a', true)] } },
      {
        event: 'runEnd',
        data: { status: 'FAILED', completionState: 'COMPLETE' },
      },
    ]);
    const events: TerminalRunEvent[] = [];
    await watchRun('key', 'run1', (e) => events.push(e), noSleep);
    expect(events.map((e) => e.type)).toEqual([
      'runBegin',
      'testBegin',
      'testEnd',
      'runEnd',
    ]);
    expect(events[0]).toMatchObject({ totalTests: 3 });
    expect(events[3]).toEqual({ type: 'runEnd', status: 'failed' });
    expect(request.mock.calls[0][0]).toMatchObject({
      url: 'v1/runs/run1',
      params: { include_specs: false },
    });
    expect(vi.mocked(readRunStream).mock.calls[0].slice(0, 2)).toEqual([
      'key',
      'run1',
    ]);
  });

  it('reconnects when the server closes the stream, and reports nothing twice', async () => {
    streams(
      [
        {
          event: 'snapshot',
          data: { ...running, records: [record('a', true)] },
        },
      ],
      new Error('socket hang up'),
      [
        {
          event: 'snapshot',
          data: { ...running, records: [record('a', true), record('b', true)] },
        },
        {
          event: 'runEnd',
          data: { status: 'FAILED', completionState: 'CANCELED' },
        },
      ]
    );
    const events: TerminalRunEvent[] = [];
    await watchRun('key', 'run1', (e) => events.push(e), noSleep);
    expect(readRunStream).toHaveBeenCalledTimes(3);
    expect(events.filter((e) => e.type === 'testEnd')).toHaveLength(2);
    expect(events[events.length - 1]).toEqual({
      type: 'runEnd',
      status: 'cancelled',
    });
  });

  it('gives up after failed connections in a row', async () => {
    vi.mocked(readRunStream).mockRejectedValue(new Error('ECONNREFUSED'));
    await expect(watchRun('key', 'run1', () => {}, noSleep)).rejects.toThrow(
      'ECONNREFUSED'
    );
    expect(readRunStream).toHaveBeenCalledTimes(5);
  });

  it('stops right away when the server refuses the stream', async () => {
    vi.mocked(readRunStream).mockRejectedValue(
      new RunStreamRefused('Currents answered 404 to the run stream')
    );
    await expect(watchRun('key', 'run1', () => {}, noSleep)).rejects.toThrow(
      '404'
    );
    expect(readRunStream).toHaveBeenCalledTimes(1);
  });
});

describe('runEndStatus', () => {
  it.each([
    ['COMPLETE', 'PASSED', 'passed'],
    ['COMPLETE', 'FAILED', 'failed'],
    ['CANCELED', 'FAILED', 'cancelled'],
    ['TIMEOUT', 'RUNNING', 'timedOut'],
    [null, null, 'failed'],
  ])('%s %s', (completionState, status, expected) => {
    expect(runEndStatus({ completionState, status })).toBe(expected);
  });
});
