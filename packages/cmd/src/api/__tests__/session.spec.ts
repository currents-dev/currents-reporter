import { AxiosError } from 'axios';
import { describe, expect, it } from 'vitest';
import { getAuthHeaders, toApiError } from '../session';

const axiosError = (status: number, data: unknown) =>
  new AxiosError('failed', 'ERR', undefined, undefined, {
    status,
    data,
  } as never);

describe('getAuthHeaders', () => {
  it('sends a record key in x-currents-key and an API key as a bearer token', () => {
    expect(getAuthHeaders({ recordKey: 'rk', apiKey: 'k' })).toEqual({
      'x-currents-key': 'rk',
    });
    expect(getAuthHeaders({ apiKey: 'k' })).toEqual({
      Authorization: 'Bearer k',
    });
  });
});

describe('toApiError', () => {
  it('uses the API message and code', () => {
    const error = toApiError(
      axiosError(403, {
        status: 'FAILED',
        error: 'sharing is off',
        code: 'sharingDisabled',
      })
    ) as Error;
    expect(error.message).toBe('403 sharingDisabled: sharing is off');
  });

  it('lists the candidates of an ambiguous target', () => {
    const error = toApiError(
      axiosError(409, {
        error: 'More than one spec matches',
        code: 'ambiguous_target',
        candidates: [
          {
            instanceId: 'i1',
            testId: 't1',
            spec: 'a.spec.ts',
            title: 'cart > adds',
          },
        ],
      })
    ) as Error;
    expect(error.message).toContain(
      '409 ambiguous_target: More than one spec matches'
    );
    expect(error.message).toContain(
      'a.spec.ts > cart > adds (instance i1, test t1)'
    );
  });

  it('lists the runs a CI environment matches', () => {
    const error = toApiError(
      axiosError(409, {
        error: 'More than one run matches',
        code: 'ambiguous_target',
        candidates: [{ runId: 'r1', ciBuildId: 'b1' }],
      })
    ) as Error;
    expect(error.message).toContain('run r1 (CI build ID b1)');
  });
});
