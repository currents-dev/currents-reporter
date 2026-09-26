type Fetch = typeof fetch;

export type SignupRequest = {
  poll_token: string;
  code: string;
  /** Seconds. */
  expires_in: number;
  /** Seconds between polls. */
  interval: number;
};

export type SignupOutcome =
  | {
      status: 'approved';
      apiKey: string;
      apiKeyId?: string;
      apiKeyExpiresAt?: string;
      orgId: string;
      orgName: string;
    }
  | { status: 'existing_account' }
  | { status: 'expired' | 'consumed' | 'revoked' }
  /** `timeoutMs` passed; the request itself may still be pending. */
  | { status: 'timeout' };

export type SignupRequestErrorCode =
  | 'email_not_allowed'
  | 'rate_limited'
  | 'invalid_request'
  | 'unexpected_response';

export class SignupRequestError extends Error {
  constructor(
    readonly code: SignupRequestErrorCode,
    message: string,
    readonly retryAfterSeconds?: number
  ) {
    super(message);
  }
}

type JsonBody = Record<string, unknown> | null;

const readJson = async (res: Response) =>
  (await res.json().catch(() => null)) as JsonBody;

function rateLimited(res: Response) {
  const retryAfter = Number(res.headers.get('retry-after'));
  return new SignupRequestError(
    'rate_limited',
    'Too many signup emails for this address or network.',
    Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : undefined
  );
}

const unexpected = (route: string, res: Response, body: JsonBody) =>
  new SignupRequestError(
    'unexpected_response',
    `${route} answered HTTP ${res.status}: ${JSON.stringify(body)}`
  );

/** Starts a signup: the API emails `email` a link to confirm it. */
export async function startSignupRequest(
  {
    apiUrl,
    email,
    clientName,
    orgName,
  }: {
    apiUrl: string;
    email: string;
    clientName: string;
    orgName?: string;
  },
  fetchImpl: Fetch = fetch
): Promise<SignupRequest> {
  const res = await fetchImpl(`${apiUrl}/v1/signup-requests`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, client_name: clientName, org_name: orgName }),
  });
  const body = await readJson(res);
  if (res.status === 400 && body?.error === 'email_not_allowed') {
    throw new SignupRequestError(
      'email_not_allowed',
      'This email address cannot be used to sign up. Use a work email.'
    );
  }
  if (res.status === 400) {
    throw new SignupRequestError(
      'invalid_request',
      String(body?.message ?? 'The API refused the signup request.')
    );
  }
  if (res.status === 429) {
    throw rateLimited(res);
  }
  if (!res.ok || !body) {
    throw unexpected('POST /v1/signup-requests', res, body);
  }
  return body as SignupRequest;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const MAX_BACKOFF_MS = 30 * 1000;

/**
 * Polls until the email is confirmed, the request ends, or `timeoutMs` passes.
 *
 * A network error or a 5xx is retried with doubling delays, capped at
 * {@link MAX_BACKOFF_MS}, so a short API outage does not end a signup the
 * person is still confirming.
 */
export async function pollSignupRequest(
  {
    apiUrl,
    request,
    timeoutMs,
  }: {
    apiUrl: string;
    request: Pick<SignupRequest, 'poll_token' | 'interval'>;
    timeoutMs: number;
  },
  {
    fetchImpl = fetch,
    wait = sleep,
    now = Date.now,
  }: {
    fetchImpl?: Fetch;
    wait?: (ms: number) => Promise<unknown>;
    now?: () => number;
  } = {}
): Promise<SignupOutcome> {
  const intervalMs = Math.max(1, request.interval) * 1000;
  const deadline = now() + timeoutMs;
  let delay = intervalMs;

  while (now() < deadline) {
    await wait(delay);
    let res: Response;
    try {
      res = await fetchImpl(`${apiUrl}/v1/signup-requests/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ poll_token: request.poll_token }),
      });
    } catch {
      delay = Math.min(delay * 2, MAX_BACKOFF_MS);
      continue;
    }
    if (res.status >= 500) {
      delay = Math.min(delay * 2, MAX_BACKOFF_MS);
      continue;
    }
    delay = intervalMs;

    const body = (await readJson(res)) as Record<string, string> | null;
    if (res.status === 410 || res.status === 404) {
      return {
        status:
          body?.status === 'consumed' || body?.status === 'revoked'
            ? body.status
            : 'expired',
      };
    }
    if (!res.ok || !body) {
      throw unexpected('POST /v1/signup-requests/token', res, body);
    }
    switch (body.status) {
      case 'pending':
        continue;
      case 'approved':
        return {
          status: 'approved',
          apiKey: body.api_key,
          apiKeyId: body.api_key_id ?? undefined,
          apiKeyExpiresAt: body.api_key_expires_at ?? undefined,
          orgId: body.org_id,
          orgName: body.org_name,
        };
      case 'existing_account':
        return { status: 'existing_account' };
      default:
        throw unexpected('POST /v1/signup-requests/token', res, body);
    }
  }
  return { status: 'timeout' };
}

export type ResendOutcome =
  | { status: 'sent'; expiresIn: number }
  /** Already confirmed: poll to collect the key. */
  | { status: 'approved' }
  | { status: 'expired' | 'consumed' };

/** Sends the email again with the same code and a new link. */
export async function resendSignupRequest(
  { apiUrl, pollToken }: { apiUrl: string; pollToken: string },
  fetchImpl: Fetch = fetch
): Promise<ResendOutcome> {
  const res = await fetchImpl(`${apiUrl}/v1/signup-requests/resend`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ poll_token: pollToken }),
  });
  const body = await readJson(res);
  if (res.status === 202) {
    return { status: 'sent', expiresIn: Number(body?.expires_in ?? 0) };
  }
  if (res.status === 409) {
    return { status: 'approved' };
  }
  if (res.status === 410 || res.status === 404) {
    return { status: body?.status === 'consumed' ? 'consumed' : 'expired' };
  }
  if (res.status === 429) {
    throw rateLimited(res);
  }
  throw unexpected('POST /v1/signup-requests/resend', res, body);
}
