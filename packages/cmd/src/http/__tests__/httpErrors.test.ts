import { AxiosError } from 'axios';
import { format } from 'util';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as log from '../../logger';
import { handleHTTPError } from '../httpErrors';

vi.mock('../../logger');

const config = { method: 'post', url: 'v1/runs', data: '{}' };

const failure = (status: number, data?: unknown) =>
  new AxiosError(
    `Request failed with status code ${status}`,
    status < 500 ? 'ERR_BAD_REQUEST' : 'ERR_BAD_RESPONSE',
    config as never,
    undefined,
    { status, data, config } as never
  );

const networkFailure = (code: string, message: string) =>
  new AxiosError(message, code, config as never);

// What the logger printed, one line per call, `spacer` included.
function printed() {
  const calls: string[] = [];
  for (const name of ['warn', 'error', 'spacer'] as const) {
    vi.mocked(log[name]).mock.calls.forEach((args, i) =>
      calls.push(
        `${vi.mocked(log[name]).mock.invocationCallOrder[i]} ${name}: ${format(...(args as [string]))}`
      )
    );
  }
  return calls
    .sort((a, b) => parseInt(a) - parseInt(b))
    .map((line) => line.replace(/^\d+ /, ''));
}

describe('handleHTTPError', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it.each([
    [
      401,
      'warn: [currents] post v1/runs - 401 Unauthorized Request from cloud service',
    ],
    [404, 'warn: [currents] post v1/runs - 404 Not Found from cloud service'],
    [
      429,
      'warn: [currents] post v1/runs - 429 Too Many Requests from cloud service',
    ],
    [
      403,
      "warn: [currents] Unexpected network response: Request failed with status code 403\n{ method: 'post', url: 'v1/runs', status: 403 }",
    ],
    [
      500,
      "warn: [currents] Unexpected network response: Request failed with status code 500\n{ method: 'post', url: 'v1/runs', status: 500 }",
    ],
  ])('names the request of a %d', (status, line) => {
    handleHTTPError(failure(status, { message: 'm' }));

    expect(printed()).toEqual([line]);
  });

  it('prints the body of a 400', () => {
    handleHTTPError(failure(400, { message: 'bad', errors: ['a'] }));

    expect(printed()).toEqual([
      "warn: [currents] post v1/runs - 400 Bad Request from cloud service:\n{ message: 'bad', errors: [ 'a', [length]: 1 ] }",
    ]);
  });

  it('prints the message and the errors of a 422 for a missing suite as an error', () => {
    handleHTTPError(
      failure(422, {
        code: 'MISSING_SUITE',
        message: 'No suite',
        errors: ['first', 'second'],
      })
    );

    expect(printed()).toEqual([
      'spacer: 1',
      'error: No suite \n  - first\n  - second\n',
    ]);
  });

  it('prints the message of a 422 for an expired run', () => {
    handleHTTPError(failure(422, { code: 'RUN_EXPIRED', message: 'Expired' }));

    expect(printed()).toEqual(['warn: Expired']);
  });

  it('prints the message and the errors of any other 422', () => {
    handleHTTPError(
      failure(422, { code: 'OTHER', message: 'Invalid', errors: ['x'] })
    );
    handleHTTPError(failure(422, { message: 'Empty', errors: [] }));

    expect(printed()).toEqual([
      'spacer: 1',
      'warn: Invalid \n  - x\n',
      'spacer: 1',
      'spacer: 1',
      'warn: Empty',
      'spacer: 1',
    ]);
  });

  it.each([
    [{ message: 'Invalid' }],
    [{ message: 'Invalid', errors: [1] }],
    [{ code: 'RUN_EXPIRED' }],
    ['text'],
    [undefined],
  ])('names the request of a 422 with %j', (data) => {
    handleHTTPError(failure(422, data));

    expect(printed()).toEqual([
      "warn: [currents] Unexpected network response: Request failed with status code 422\n{ method: 'post', url: 'v1/runs', status: 422 }",
    ]);
  });

  it.each([
    ['ECONNABORTED', 'warn: Network connection aborted'],
    ['ECONNREFUSED', 'warn: Network connection aborted'],
    ['ECONNRESET', 'warn: Network connection reset'],
    ['ETIMEDOUT', 'warn: Network connection timeout'],
  ])('names a failed connection, %s', (code, line) => {
    handleHTTPError(networkFailure(code, 'failed'));

    expect(printed()).toEqual([line]);
  });

  it('prints the message of another failure without a response', () => {
    handleHTTPError(
      networkFailure('ENOTFOUND', 'getaddrinfo ENOTFOUND cy.currents.dev')
    );

    expect(printed()).toEqual([
      'warn: [currents] Unexpected network error: getaddrinfo ENOTFOUND cy.currents.dev\n{\n  method: undefined,\n  url: undefined,\n  status: undefined,\n  payload: undefined\n}',
    ]);
  });

  it('prints an error that is not an HTTP error', () => {
    handleHTTPError(new Error('boom'));

    expect(printed()[0]).toMatch(
      /^warn: Unexpected error while sending network request: Error: boom/
    );
  });
});
