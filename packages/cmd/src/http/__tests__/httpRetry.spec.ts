import { AxiosError, AxiosHeaders } from 'axios';
import { describe, expect, it } from 'vitest';
import { getDelay, getRetryAfterMs, isRetriableRestError } from '../httpRetry';

const error = (
  method: string,
  options: { status?: number; code?: string; retryAfter?: string } = {}
) =>
  new AxiosError(
    'failed',
    options.code,
    { method, headers: new AxiosHeaders() } as never,
    undefined,
    options.status
      ? ({
          status: options.status,
          data: {},
          headers: options.retryAfter
            ? { 'retry-after': options.retryAfter }
            : {},
        } as never)
      : undefined
  );

describe('isRetriableRestError', () => {
  it('does not repeat a POST after the server may have handled it', () => {
    expect(isRetriableRestError(error('post', { status: 502 }))).toBe(false);
    expect(isRetriableRestError(error('post', { status: 503 }))).toBe(false);
    expect(isRetriableRestError(error('post', { status: 504 }))).toBe(false);
    expect(isRetriableRestError(error('post', { code: 'ECONNRESET' }))).toBe(
      false
    );
    expect(isRetriableRestError(error('post', { code: 'ETIMEDOUT' }))).toBe(
      false
    );
  });

  it('repeats a POST the server refused or never received', () => {
    expect(isRetriableRestError(error('post', { status: 429 }))).toBe(true);
    expect(isRetriableRestError(error('post', { code: 'ECONNREFUSED' }))).toBe(
      true
    );
  });

  it('keeps retrying a GET on gateway errors', () => {
    expect(isRetriableRestError(error('get', { status: 502 }))).toBe(true);
  });

  it('stops when Retry-After is longer than a minute', () => {
    expect(
      isRetriableRestError(error('post', { status: 429, retryAfter: '61' }))
    ).toBe(false);
    expect(
      isRetriableRestError(error('post', { status: 429, retryAfter: '30' }))
    ).toBe(true);
  });
});

describe('Retry-After', () => {
  it('reads seconds and dates', () => {
    expect(
      getRetryAfterMs(error('post', { status: 429, retryAfter: '7' }))
    ).toBe(7000);
    const now = Date.parse('2026-10-02T00:00:00Z');
    expect(
      getRetryAfterMs(
        error('post', {
          status: 429,
          retryAfter: 'Fri, 02 Oct 2026 00:00:10 GMT',
        }),
        now
      )
    ).toBe(10000);
    expect(getRetryAfterMs(error('post', { status: 429 }))).toBeUndefined();
  });

  it('waits as long as the server asks, else the default delays', () => {
    expect(getDelay(1, error('post', { status: 429, retryAfter: '5' }))).toBe(
      5000
    );
    expect(getDelay(2)).toBe(15000);
  });

  it('keeps Retry-After between the default delay and a minute', () => {
    expect(
      getDelay(1, error('post', { status: 503, retryAfter: '3600' }))
    ).toBe(60000);
    expect(getDelay(1, error('post', { status: 503, retryAfter: '0' }))).toBe(
      3000
    );
    expect(getDelay(2, error('post', { status: 503, retryAfter: '5' }))).toBe(
      15000
    );
  });
});
