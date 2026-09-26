import { describe, expect, it, vi } from 'vitest';
import {
  pollSignupRequest,
  resendSignupRequest,
  SignupRequestError,
  startSignupRequest,
} from '../signupRequest';

const API = 'http://api.test';
const request = { poll_token: 'poll', interval: 3 };
const timeoutMs = 60_000;

const json = (
  status: number,
  body: unknown,
  headers: Record<string, string> = {}
) => new Response(JSON.stringify(body), { status, headers });

/** A clock that advances by each wait, so the timeout is reached without real time. */
function fakeClock() {
  let t = 0;
  return {
    now: () => t,
    wait: vi.fn(async (ms: number) => {
      t += ms;
    }),
  };
}

function fetchSequence(...responses: Array<Response | Error>) {
  const fn = vi.fn(async (_input: string, _init?: RequestInit) => {
    const next = responses.shift();
    if (!next) throw new Error('no more responses');
    if (next instanceof Error) throw next;
    return next;
  });
  return fn as unknown as typeof fetch & typeof fn;
}

const poll = (fetchImpl: typeof fetch, clock = fakeClock()) =>
  pollSignupRequest(
    { apiUrl: API, request, timeoutMs },
    { fetchImpl, ...clock }
  );

describe('pollSignupRequest', () => {
  it('waits through pending and returns the approved key with its id and expiry', async () => {
    const clock = fakeClock();
    const fetchImpl = fetchSequence(
      json(200, { status: 'pending' }),
      json(200, { status: 'pending' }),
      json(200, {
        status: 'approved',
        api_key: 'crnts_pat_x',
        api_key_id: 'pat1',
        api_key_expires_at: '2026-10-26T00:00:00.000Z',
        org_id: 'org1',
        org_name: 'Acme',
      })
    );

    const outcome = await poll(fetchImpl, clock);

    expect(outcome).toEqual({
      status: 'approved',
      apiKey: 'crnts_pat_x',
      apiKeyId: 'pat1',
      apiKeyExpiresAt: '2026-10-26T00:00:00.000Z',
      orgId: 'org1',
      orgName: 'Acme',
    });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(fetchImpl.mock.calls[0]).toEqual([
      `${API}/v1/signup-requests/token`,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ poll_token: 'poll' }),
      }),
    ]);
    expect(clock.wait).toHaveBeenNthCalledWith(1, 3000);
  });

  it('reports an existing account', async () => {
    await expect(
      poll(fetchSequence(json(200, { status: 'existing_account' })))
    ).resolves.toEqual({ status: 'existing_account' });
  });

  it.each([
    [410, { status: 'consumed' }, 'consumed'],
    [410, { status: 'expired' }, 'expired'],
    [410, { status: 'revoked' }, 'revoked'],
    [404, { status: 'not_found' }, 'expired'],
  ])('reports HTTP %i %o as %s', async (status, body, expected) => {
    await expect(poll(fetchSequence(json(status, body)))).resolves.toEqual({
      status: expected,
    });
  });

  it('retries network errors and 5xx with growing delays', async () => {
    const clock = fakeClock();
    const outcome = await poll(
      fetchSequence(
        new Error('ECONNRESET'),
        json(503, {}),
        json(200, { status: 'existing_account' })
      ),
      clock
    );
    expect(outcome).toEqual({ status: 'existing_account' });
    expect(clock.wait.mock.calls.map(([ms]) => ms)).toEqual([
      3000, 6000, 12000,
    ]);
  });

  it('answers timeout, not expired, when its own deadline passes', async () => {
    await expect(
      poll(vi.fn(async () => json(200, { status: 'pending' })) as never)
    ).resolves.toEqual({ status: 'timeout' });
  });

  it('refuses an unknown status', async () => {
    await expect(
      poll(fetchSequence(json(200, { status: 'surprise' })))
    ).rejects.toMatchObject({ code: 'unexpected_response' });
  });
});

describe('startSignupRequest', () => {
  const start = (response: Response) =>
    startSignupRequest(
      { apiUrl: API, email: 'a@acme.com', clientName: 'Test', orgName: 'Acme' },
      fetchSequence(response)
    );

  it('sends the org name and returns the request', async () => {
    const body = {
      poll_token: 'p',
      code: 'AB23',
      expires_in: 1800,
      interval: 3,
    };
    const fetchImpl = fetchSequence(json(202, body));
    await expect(
      startSignupRequest(
        { apiUrl: API, email: 'a@acme.com', clientName: 'CC', orgName: 'Acme' },
        fetchImpl
      )
    ).resolves.toEqual(body);
    expect(JSON.parse(fetchImpl.mock.calls[0][1]!.body as string)).toEqual({
      email: 'a@acme.com',
      client_name: 'CC',
      org_name: 'Acme',
    });
  });

  it('names a refused address', async () => {
    await expect(
      start(json(400, { error: 'email_not_allowed' }))
    ).rejects.toMatchObject({ code: 'email_not_allowed' });
  });

  it('passes the API validation message through', async () => {
    await expect(
      start(
        json(400, {
          error: 'invalid_request',
          message: 'org_name must be 60 characters or fewer',
        })
      )
    ).rejects.toMatchObject({
      code: 'invalid_request',
      message: 'org_name must be 60 characters or fewer',
    });
  });

  it('reads Retry-After from a 429', async () => {
    const error = await start(
      json(429, { error: 'rate_limited' }, { 'Retry-After': '120' })
    ).catch((e) => e);
    expect(error).toBeInstanceOf(SignupRequestError);
    expect(error).toMatchObject({
      code: 'rate_limited',
      retryAfterSeconds: 120,
    });
  });
});

describe('resendSignupRequest', () => {
  const resend = (response: Response) =>
    resendSignupRequest(
      { apiUrl: API, pollToken: 'p' },
      fetchSequence(response)
    );

  it.each([
    [
      202,
      { status: 'sent', expires_in: 600 },
      { status: 'sent', expiresIn: 600 },
    ],
    [409, { status: 'approved' }, { status: 'approved' }],
    [410, { status: 'consumed' }, { status: 'consumed' }],
    [410, { status: 'expired' }, { status: 'expired' }],
    [404, { status: 'not_found' }, { status: 'expired' }],
  ])('maps HTTP %i %o', async (status, body, expected) => {
    await expect(resend(json(status, body))).resolves.toEqual(expected);
  });

  it('throws rate_limited on 429', async () => {
    await expect(resend(json(429, {}))).rejects.toMatchObject({
      code: 'rate_limited',
    });
  });
});
