import { AxiosError } from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ApiServer,
  Response,
  startApiServer,
} from '../../test-utils/api-server';
import { ClientType, createClient } from '../client';
import { makeRequest } from '../http';
import { getMaxRetries, isRetriableError } from '../httpRetry';

// The real delays are 3, 15 and 30 seconds.
vi.mock('../httpRetry', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../httpRetry')>()),
  getDelay: () => 1,
}));
vi.mock('../../logger');

describe('retries of requests to the API', () => {
  let api: ApiServer;
  let answers: Response[];

  beforeEach(async () => {
    answers = [];
    api = await startApiServer(() => answers.shift() ?? { status: 200 });
    vi.stubEnv('CURRENTS_API_URL', api.url);
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await api.close();
  });

  const request = (method: 'GET' | 'POST') =>
    makeRequest(
      ClientType.API,
      {
        url: 'v1/runs',
        method,
        data: method === 'POST' ? { a: 1 } : undefined,
      },
      createClient
    );

  it('succeeds after two answers with 503', async () => {
    answers.push(
      { status: 503 },
      { status: 503 },
      { status: 200, json: { ok: true } }
    );

    const response = await request('POST');

    expect(response.data).toEqual({ ok: true });
    expect(api.requests).toHaveLength(3);
  });

  it('sends the same body with every attempt', async () => {
    answers.push({ status: 503 }, { status: 200 });

    await request('POST');

    expect(api.requests.map((r) => r.json)).toEqual([{ a: 1 }, { a: 1 }]);
  });

  it('gives up after the first request and three retries', async () => {
    answers.push(
      ...Array.from({ length: 10 }, () => ({ status: 503 }) as Response)
    );

    await expect(request('GET')).rejects.toMatchObject({
      response: { status: 503 },
    });
    expect(api.requests).toHaveLength(4);
  });

  it.each([408, 429, 502, 504])('retries an answer with %d', async (status) => {
    answers.push({ status }, { status: 200 });

    await request('GET');

    expect(api.requests).toHaveLength(2);
  });

  it('retries when the connection is closed without an answer', async () => {
    answers.push({ destroy: true }, { destroy: true }, { status: 200 });

    await request('GET');

    expect(api.requests).toHaveLength(3);
  });

  it.each(['GET', 'POST'] as const)(
    'does not repeat a %s that got 500',
    async (method) => {
      answers.push({ status: 500 }, { status: 200 });

      await expect(request(method)).rejects.toMatchObject({
        response: { status: 500 },
      });
      expect(api.requests).toHaveLength(1);
    }
  );

  it.each([400, 401, 403, 404, 409, 422])(
    'does not repeat a request that got %d',
    async (status) => {
      answers.push({ status }, { status: 200 });

      await expect(request('POST')).rejects.toMatchObject({
        response: { status },
      });
      expect(api.requests).toHaveLength(1);
    }
  );
});

describe('retry settings', () => {
  it('retries three times, waiting 3, 15 and 30 seconds', async () => {
    const { getDelay: realGetDelay } =
      await vi.importActual<typeof import('../httpRetry')>('../httpRetry');

    expect(getMaxRetries()).toBe(3);
    expect([1, 2, 3].map((retry) => realGetDelay(retry))).toEqual([
      3000, 15000, 30000,
    ]);
  });

  it('retries POST and GET alike, the condition ignores the method', () => {
    const error = (method: string, status: number) =>
      new AxiosError('failed', undefined, { method } as never, undefined, {
        status,
      } as never);

    expect(isRetriableError(error('post', 503))).toBe(true);
    expect(isRetriableError(error('get', 503))).toBe(true);
  });
});
