import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getClient } from '../../../http/client';
import { getAttemptSteps } from '../../watch';
import { graphqlQuery } from '../../watch/graphql';
import { dashboardRunUrl, getRunWrapped, MAX_STEP_READS } from '../index';
import type { WrappedRecord } from '../facts';

vi.mock('../../watch/graphql', () => ({ graphqlQuery: vi.fn() }));
vi.mock('../../watch', () => ({ getAttemptSteps: vi.fn() }));
vi.mock('../../../http/client', () => ({
  ClientType: { REST_API: 'restApi' },
  getClient: vi.fn(),
}));

const request = vi.fn();
const restRun = (completionState = 'COMPLETE') => ({
  data: {
    data: {
      createdAt: '2026-11-25T00:00:00.000Z',
      durationMs: 1000,
      completionState,
    },
  },
});
const records = (count: number): WrappedRecord[] =>
  Array.from({ length: count }, (_, i) => ({
    recordId: `r${i}`,
    machineId: 'm',
    title: [`t${i}`],
    _s: 'passed',
    _f: false,
    attempts: [
      {
        attempt: 0,
        parallelIndex: i % 2,
        startTime: '2026-11-25T00:00:00.000Z',
        status: 'passed',
        duration: 1000,
      },
    ],
  }));

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('CURRENTS_REST_API_URL', 'https://api-staging.currents.dev');
  vi.mocked(getClient).mockReturnValue({ request } as any);
  request.mockResolvedValue(restRun());
  vi.mocked(getAttemptSteps).mockResolvedValue([
    { id: 's', title: 'open', duration: 5, steps: [] },
  ]);
});
afterEach(() => vi.unstubAllEnvs());

describe('getRunWrapped', () => {
  it('reads the steps of each attempt that ran', async () => {
    const list = records(3);
    list.push({
      ...list[0],
      recordId: 'skipped',
      attempts: [
        { ...list[0].attempts[0], parallelIndex: -1, status: 'skipped' },
      ],
    });
    vi.mocked(graphqlQuery).mockResolvedValue({ testRecordList: list });
    const card = await getRunWrapped('key', 'run1');
    expect(getAttemptSteps).toHaveBeenCalledTimes(3);
    expect(card.facts.steps?.total).toBe(3);
    expect(card.stepsNote).toBeUndefined();
    expect(card.ended).toBe(true);
    expect(card.runUrl).toBe('https://app-staging.currents.dev/run/run1');
  });

  it('leaves the step facts out above the limit instead of counting part of them', async () => {
    vi.mocked(graphqlQuery).mockResolvedValue({
      testRecordList: records(MAX_STEP_READS + 1),
    });
    const card = await getRunWrapped('key', 'run1');
    expect(getAttemptSteps).not.toHaveBeenCalled();
    expect(card.facts.steps).toBeUndefined();
    expect(card.stepsNote).toBe('Steps not read: 201 attempts, more than 200');
  });

  it('leaves the step facts out when a read fails', async () => {
    vi.mocked(graphqlQuery).mockResolvedValue({ testRecordList: records(3) });
    vi.mocked(getAttemptSteps).mockRejectedValueOnce(new Error('boom'));
    const card = await getRunWrapped('key', 'run1');
    expect(card.facts.steps).toBeUndefined();
    expect(card.stepsNote).toBe('Steps not read: the request failed');
  });

  it('reports a run in progress', async () => {
    request.mockResolvedValue(restRun('IN_PROGRESS'));
    vi.mocked(graphqlQuery).mockResolvedValue({ testRecordList: [] });
    expect((await getRunWrapped('key', 'run1')).ended).toBe(false);
  });
});

describe('dashboardRunUrl', () => {
  it.each([
    ['https://api.currents.dev', 'https://app.currents.dev/run/r1'],
    [
      'https://api-staging.currents.dev/',
      'https://app-staging.currents.dev/run/r1',
    ],
    ['https://currents.example.com', undefined],
  ])('%s gives %s', (rest, url) => {
    vi.stubEnv('CURRENTS_REST_API_URL', rest);
    expect(dashboardRunUrl('r1')).toBe(url);
  });
});
