import { format } from 'util';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { warn } from '../../logger';
import { formatDuration, onRetry } from '../httpRetry';
import { HttpError, HttpResponse } from '../send';

vi.mock('../../logger');

const failure = (status: number, retryAfter?: string) =>
  new HttpError(
    `Request failed with status code ${status}`,
    'ERR_BAD_RESPONSE',
    { method: 'post', url: 'v1/runs' },
    {
      status,
      headers: retryAfter ? { 'retry-after': retryAfter } : {},
    } as HttpResponse
  );

const warnings = () =>
  vi.mocked(warn).mock.calls.map((args) => format(...(args as [string])));

describe('the warning before a retry', () => {
  afterEach(() => {
    vi.mocked(warn).mockReset();
  });

  it('names the request and the wait of each retry', () => {
    for (const retry of [1, 2, 3]) {
      onRetry(retry, failure(503), { method: 'POST', url: 'v1/runs' });
    }

    expect(warnings()).toEqual([
      "Network request 'POST v1/runs' failed: 'Request failed with status code 503'. Next attempt is in 3s (1/3).",
      "Network request 'POST v1/runs' failed: 'Request failed with status code 503'. Next attempt is in 15s (2/3).",
      "Network request 'POST v1/runs' failed: 'Request failed with status code 503'. Next attempt is in 30s (3/3).",
    ]);
  });

  it.each([
    ['4.5', '4.5s'],
    ['45.12', '45.1s'],
    ['3600', '1m'],
  ])('waits for Retry-After %s: %s', (retryAfter, wait) => {
    onRetry(1, failure(429, retryAfter), { method: 'GET', url: 'v1/runs/r1' });

    expect(warnings()).toEqual([
      `Network request 'GET v1/runs/r1' failed: 'Request failed with status code 429'. Next attempt is in ${wait} (1/3).`,
    ]);
  });
});

describe('formatDuration', () => {
  // What pretty-ms 7.0.1 returns for the same values.
  it.each([
    [0, '0ms'],
    [1, '1ms'],
    [999, '999ms'],
    [1000, '1s'],
    [1050, '1s'],
    [1099, '1s'],
    [1100, '1.1s'],
    [3000, '3s'],
    [7500, '7.5s'],
    [59999, '59.9s'],
    [60000, '1m'],
    [61500, '1m 1.5s'],
    [3600000, '1h'],
    [3723400, '1h 2m 3.4s'],
  ])('%d ms is %s', (ms, text) => {
    expect(formatDuration(ms)).toBe(text);
  });
});
