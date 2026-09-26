import { createHash } from 'crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  assertOwnEndpoint,
  authorize,
  canOpenBrowser,
  OAuthLoginError,
  refresh,
} from '../oauth';

const API = 'https://api.test';
const metadata = {
  issuer: API,
  authorization_endpoint: `${API}/api/auth/oauth2/authorize`,
  token_endpoint: `${API}/api/auth/oauth2/token`,
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status });

/** Discovery and token endpoints; everything else goes to the real network. */
function stubAuthServer(tokenResponse: () => Response) {
  const realFetch = globalThis.fetch;
  const fetchMock = vi.fn(async (input: string, init?: RequestInit) => {
    if (input.endsWith('/.well-known/oauth-authorization-server'))
      return json(200, metadata);
    if (input.endsWith('/.well-known/oauth-protected-resource'))
      return json(200, { resource: `${API}/v1` });
    if (input === metadata.token_endpoint) return tokenResponse();
    return realFetch(input, init);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

/** Plays the browser: calls the loopback redirect with what `answer` returns. */
const respondWith =
  (answer: (params: URLSearchParams) => Record<string, string>) =>
  (url: string) => {
    const params = new URL(url).searchParams;
    const callback = new URL(params.get('redirect_uri')!);
    for (const [key, value] of Object.entries(answer(params))) {
      callback.searchParams.set(key, value);
    }
    void fetch(callback.toString());
  };

const jwt = (payload: object) =>
  `h.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.s`;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('canOpenBrowser', () => {
  it.each([
    [{}, 'darwin', true],
    [{ SSH_CONNECTION: '1 2 3 4' }, 'darwin', false],
    [{}, 'linux', false],
    [{ DISPLAY: ':0' }, 'linux', true],
    [{ WAYLAND_DISPLAY: 'wayland-0' }, 'linux', true],
    [{ DISPLAY: ':0', SSH_TTY: '/dev/pts/0' }, 'linux', false],
  ] as const)('%o on %s → %s', (env, platform, expected) => {
    expect(canOpenBrowser(env, platform)).toBe(expected);
  });
});

describe('authorize', () => {
  it('sends a PKCE challenge and exchanges the code with its verifier', async () => {
    const fetchMock = stubAuthServer(() =>
      json(200, {
        access_token: jwt({ org_id: 'org1' }),
        refresh_token: 'rt',
        expires_in: 3600,
        scope: 'openid projects:read',
      })
    );
    let challenge = '';

    const credentials = await authorize({
      apiUrl: API,
      signup: false,
      browser: false,
      onUrl: respondWith((params) => {
        challenge = params.get('code_challenge')!;
        expect(params.get('code_challenge_method')).toBe('S256');
        expect(params.get('client_id')).toBe('currents-cli');
        expect(params.get('prompt')).toBeNull();
        return { code: 'c1', state: params.get('state')!, iss: API };
      }),
    });

    const tokenCall = fetchMock.mock.calls.find(
      ([input]) => input === metadata.token_endpoint
    )!;
    const form = new URLSearchParams(tokenCall[1]!.body as URLSearchParams);
    expect(form.get('code')).toBe('c1');
    expect(
      createHash('sha256')
        .update(form.get('code_verifier')!)
        .digest('base64url')
    ).toBe(challenge);
    expect(credentials).toMatchObject({
      kind: 'oauth',
      refreshToken: 'rt',
      orgId: 'org1',
      scope: 'openid projects:read',
    });
  });

  it('asks for signup with prompt=create', async () => {
    stubAuthServer(() => json(200, { access_token: jwt({}) }));
    await authorize({
      apiUrl: API,
      signup: true,
      browser: false,
      onUrl: respondWith((params) => {
        expect(params.get('prompt')).toBe('create');
        return { code: 'c', state: params.get('state')! };
      }),
    });
  });

  it('ignores a callback with another state and keeps waiting', async () => {
    stubAuthServer(() => json(200, { access_token: jwt({ org_id: 'o' }) }));
    let authorizeUrl = '';
    const done = authorize({
      apiUrl: API,
      signup: false,
      browser: false,
      timeoutMs: 5_000,
      onUrl: (url) => {
        authorizeUrl = url;
      },
    });
    await vi.waitFor(() => expect(authorizeUrl).not.toBe(''));
    const callback = new URL(authorizeUrl).searchParams.get('redirect_uri')!;

    const forged = await fetch(`${callback}?code=x&state=forged`);
    expect(forged.status).toBe(400);

    respondWith((params) => ({ code: 'c', state: params.get('state')! }))(
      authorizeUrl
    );
    await expect(done).resolves.toMatchObject({ orgId: 'o' });
  });

  it('escapes the error it shows on the callback page', async () => {
    stubAuthServer(() => json(200, {}));
    let authorizeUrl = '';
    const done = authorize({
      apiUrl: API,
      signup: false,
      browser: false,
      onUrl: (url) => {
        authorizeUrl = url;
      },
    });
    await vi.waitFor(() => expect(authorizeUrl).not.toBe(''));
    const params = new URL(authorizeUrl).searchParams;
    const callback = new URL(params.get('redirect_uri')!);
    callback.searchParams.set('state', params.get('state')!);
    callback.searchParams.set('error', '<script>x</script>');

    const html = await (await fetch(callback.toString())).text();

    expect(html).not.toContain('<script>');
    expect(html).toContain('&#60;script&#62;');
    await expect(done).rejects.toMatchObject({ code: 'authorization_failed' });
  });

  it('reports access_denied', async () => {
    stubAuthServer(() => json(200, {}));
    await expect(
      authorize({
        apiUrl: API,
        signup: false,
        browser: false,
        onUrl: respondWith((params) => ({
          error: 'access_denied',
          state: params.get('state')!,
        })),
      })
    ).rejects.toMatchObject({ code: 'access_denied' });
  });

  it('times out when nobody approves', async () => {
    stubAuthServer(() => json(200, {}));
    await expect(
      authorize({
        apiUrl: API,
        signup: false,
        browser: false,
        timeoutMs: 20,
        onUrl: () => {},
      })
    ).rejects.toMatchObject({ code: 'timeout' });
  });
});

describe('refresh', () => {
  const stored = {
    kind: 'oauth' as const,
    apiUrl: API,
    accessToken: 'old',
    refreshToken: 'rt',
    expiresAt: 0,
  };

  it('reports a refused refresh token as session_expired', async () => {
    stubAuthServer(() => json(400, { error: 'invalid_grant' }));
    const error = await refresh(stored).catch((e) => e);
    expect(error).toBeInstanceOf(OAuthLoginError);
    expect(error.code).toBe('session_expired');
  });

  it('keeps the old refresh token when none is returned', async () => {
    stubAuthServer(() => json(200, { access_token: jwt({}), expires_in: 60 }));
    await expect(refresh(stored)).resolves.toMatchObject({
      accessToken: expect.any(String),
      refreshToken: 'rt',
    });
  });
});

describe('assertOwnEndpoint', () => {
  it.each([
    [
      'https://api.currents.dev',
      'https://api.currents.dev/api/auth/oauth2/authorize',
    ],
    ['http://localhost:4000', 'http://localhost:4000/api/auth/oauth2/token'],
  ])('accepts %s → %s', (api, endpoint) => {
    expect(() => assertOwnEndpoint(api, endpoint, 'x')).not.toThrow();
  });

  it.each([
    [
      'another host',
      'https://api.currents.dev',
      'https://evil.example/authorize',
    ],
    [
      'another port',
      'http://localhost:4000',
      'http://localhost:5000/authorize',
    ],
    [
      'plain HTTP off localhost',
      'http://api.example.com',
      'http://api.example.com/authorize',
    ],
    ['a file URL', 'https://api.currents.dev', 'file:///etc/passwd'],
  ])('refuses %s', (_, api, endpoint) => {
    expect(() => assertOwnEndpoint(api, endpoint, 'x')).toThrow(
      OAuthLoginError
    );
  });

  it('stops login before opening a foreign authorize URL', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        json(200, {
          ...metadata,
          authorization_endpoint: 'https://evil.example/a',
        })
      )
    );
    const onUrl = vi.fn();
    await expect(
      authorize({ apiUrl: API, signup: false, browser: false, onUrl })
    ).rejects.toMatchObject({ code: 'authorization_failed' });
    expect(onUrl).not.toHaveBeenCalled();
  });
});
