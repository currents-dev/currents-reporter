import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getClient } from '../../../http/client';
import type { TerminalRunEvent } from '../events';
import { graphqlQuery, openSubscriptions, type Subscription } from '../graphql';
import { runEndStatus, watchRun } from '../index';
import type { TestRecord } from '../records';

vi.mock('../graphql', () => ({
  graphqlQuery: vi.fn(),
  openSubscriptions: vi.fn(),
}));
vi.mock('../../../http/client', () => ({
  ClientType: { REST_API: 'restApi' },
  getClient: vi.fn(),
}));

const restRun = (completionState: string, status = 'RUNNING') => ({
  data: {
    data: {
      projectId: 'p1',
      createdAt: '2026-11-25T00:00:00.000Z',
      status,
      completionState,
      groups: [{ tests: { total: 2 } }, { tests: { total: 1 } }],
    },
  },
});

const record = (recordId: string, done: boolean): TestRecord => ({
  recordId,
  machineId: 'm',
  groupId: '',
  spec: 'a.spec.ts',
  title: [recordId],
  _d: done,
  _f: false,
  attempts: [
    { attempt: 0, parallelIndex: 0, status: 'passed', duration: 1, _d: done },
  ],
});

const request = vi.fn();
const query = vi.mocked(graphqlQuery);

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getClient).mockReturnValue({ request } as any);
});

describe('watchRun', () => {
  it('reads a finished run once, without subscribing', async () => {
    request.mockResolvedValue(restRun('COMPLETE', 'FAILED'));
    query.mockResolvedValue({ testRecordList: [record('a', true)] });
    const events: TerminalRunEvent[] = [];
    await watchRun('key', 'run1', (e) => events.push(e));
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
    expect(query.mock.calls[0][2]).toEqual({ runId: 'run1' });
    expect(openSubscriptions).not.toHaveBeenCalled();
  });

  it('fetches changed records and ends when the run is cancelled', async () => {
    request.mockResolvedValue(restRun('IN_PROGRESS'));
    let subscriptions: Subscription[] = [];
    let closeConnection = () => {};
    vi.mocked(openSubscriptions).mockImplementation((_key, subs) => {
      subscriptions = subs;
      return {
        ready: Promise.resolve(),
        closed: new Promise<void>((resolve) => (closeConnection = resolve)),
        close: () => closeConnection(),
      };
    });
    query.mockImplementation(async (_key, text) =>
      text.includes('testRecordList')
        ? { testRecordList: [record('a', true), record('b', true)] }
        : { testRecords: [record('b', true)] }
    );
    const events: TerminalRunEvent[] = [];
    const watching = watchRun('key', 'run1', (e) => events.push(e));
    await vi.waitFor(() => expect(subscriptions).toHaveLength(2));
    expect(subscriptions[1].variables).toEqual({ projectId: 'p1' });
    subscriptions[0].onNext({ runTestRecordsChanged: { recordIds: ['b'] } });
    subscriptions[1].onNext({
      runChanged: { runId: 'other', event: 'CANCELLED' },
    });
    subscriptions[1].onNext({
      runChanged: { runId: 'run1', event: 'CANCELLED' },
    });
    await watching;
    expect(
      query.mock.calls.some(([, , vars]) => (vars as any).ids?.[0] === 'b')
    ).toBe(true);
    expect(events.filter((e) => e.type === 'testEnd')).toHaveLength(2);
    expect(events[events.length - 1]).toEqual({
      type: 'runEnd',
      status: 'cancelled',
    });
  });

  it('fails when the connection closes', async () => {
    request.mockResolvedValue(restRun('IN_PROGRESS'));
    vi.mocked(openSubscriptions).mockReturnValue({
      ready: new Promise(() => {}),
      closed: Promise.reject(
        new Error('The connection to Currents closed (4403: Forbidden)')
      ),
      close: () => {},
    });
    await expect(watchRun('key', 'run1', () => {})).rejects.toThrow('4403');
  });
});

describe('runEndStatus', () => {
  it.each([
    ['IN_PROGRESS', 'FAILING', undefined],
    ['COMPLETE', 'PASSED', 'passed'],
    ['COMPLETE', 'FAILED', 'failed'],
    ['CANCELED', 'FAILED', 'cancelled'],
    ['TIMEOUT', 'RUNNING', 'timedOut'],
  ])('%s %s', (completionState, status, expected) => {
    expect(runEndStatus({ completionState, status } as any)).toBe(expected);
  });
});
