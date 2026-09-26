import { debug as _debug } from '@debug';
import { spawn } from 'child_process';
import { createHash, randomBytes } from 'crypto';
import http from 'http';
import { AddressInfo } from 'net';
import { OAuthCredentials } from './credentials';

const debug = _debug.extend('auth');

export const CLIENT_ID = 'currents-cli';
export const SCOPES =
  'openid offline_access projects:read projects:write results:read';
export const LOGIN_TIMEOUT_MS = 10 * 60 * 1000;

export type OAuthLoginErrorCode =
  | 'access_denied'
  | 'authorization_failed'
  | 'timeout'
  | 'session_expired';

export class OAuthLoginError extends Error {
  constructor(
    readonly code: OAuthLoginErrorCode,
    message: string
  ) {
    super(message);
  }
}

export type AuthServerMetadata = {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  revocation_endpoint?: string;
};

type TokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  error?: string;
  error_description?: string;
};

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`GET ${url} answered HTTP ${res.status}`);
  }
  return (await res.json()) as T;
}

/**
 * The RFC 8414 document for the authorization server and the RFC 9728 document
 * naming the `resource` every authorize and token request must carry.
 */
const LOOPBACK_HOSTS = ['localhost', '127.0.0.1', '[::1]'];

/**
 * The endpoints the server advertises must be on the API's own origin, over
 * HTTPS unless it is local. The API URL can come from a `.env` in whatever
 * directory the CLI runs in; without this, such a file could have `login`
 * open a look-alike sign-in page, or send the refresh token elsewhere.
 */
export function assertOwnEndpoint(
  apiUrl: string,
  endpoint: string,
  name: string
) {
  const api = new URL(apiUrl);
  const url = new URL(endpoint);
  const local = LOOPBACK_HOSTS.includes(url.hostname);
  if (url.origin !== api.origin || (url.protocol !== 'https:' && !local)) {
    throw new OAuthLoginError(
      'authorization_failed',
      `${apiUrl} advertised ${name} at ${url.origin}, which is not the API's own HTTPS origin`
    );
  }
}

export async function discover(apiUrl: string) {
  const metadata = await getJson<AuthServerMetadata>(
    `${apiUrl}/.well-known/oauth-authorization-server`
  );
  assertOwnEndpoint(
    apiUrl,
    metadata.authorization_endpoint,
    'authorization_endpoint'
  );
  assertOwnEndpoint(apiUrl, metadata.token_endpoint, 'token_endpoint');
  if (metadata.revocation_endpoint) {
    assertOwnEndpoint(
      apiUrl,
      metadata.revocation_endpoint,
      'revocation_endpoint'
    );
  }
  const { resource } = await getJson<{ resource: string }>(
    `${apiUrl}/.well-known/oauth-protected-resource`
  );
  return { metadata, resource };
}

const base64url = (buffer: Buffer) => buffer.toString('base64url');

/**
 * False over SSH and on Linux without a display, where `xdg-open` would fail
 * or open a browser the person cannot see.
 */
export function canOpenBrowser(env = process.env, platform = process.platform) {
  if (env.SSH_CONNECTION || env.SSH_TTY) {
    return false;
  }
  if (platform === 'darwin' || platform === 'win32') {
    return true;
  }
  return Boolean(env.DISPLAY || env.WAYLAND_DISPLAY);
}

function openBrowser(url: string) {
  const command =
    process.platform === 'darwin'
      ? 'open'
      : process.platform === 'win32'
        ? 'explorer'
        : 'xdg-open';
  try {
    spawn(command, [url], { detached: true, stdio: 'ignore' }).unref();
  } catch (e) {
    debug('Could not open a browser: %o', e);
  }
}

const escapeHtml = (text: string) =>
  text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

const page = (title: string, body: string) =>
  `<!doctype html><html><head><title>${title}</title></head><body style="font-family:system-ui;padding:48px;text-align:center"><h2>${title}</h2><p>${body}</p></body></html>`;

/**
 * Listens on 127.0.0.1 (not `localhost`: the provider ignores the port only for
 * loopback IPs) and resolves with the query of the first /callback request.
 */
async function startLoopback(state: string) {
  let resolveQuery: (query: URLSearchParams) => void;
  const received = new Promise<URLSearchParams>((resolve) => {
    resolveQuery = resolve;
  });
  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    if (url.pathname !== '/callback') {
      res.writeHead(404).end();
      return;
    }
    // Any page the browser visits can request this port. Only the response to
    // our own authorization request, which carries its state, ends the wait.
    if (url.searchParams.get('state') !== state) {
      res.writeHead(400).end();
      return;
    }
    const failed = url.searchParams.get('error');
    res
      .writeHead(200, { 'Content-Type': 'text/html' })
      .end(
        failed
          ? page(
              'Currents CLI was not authorized',
              `${escapeHtml(failed)}. You can close this tab.`
            )
          : page(
              'Currents CLI is authorized',
              'You can close this tab and return to your terminal.'
            )
      );
    resolveQuery(url.searchParams);
  });
  await new Promise<void>((resolve) =>
    server.listen(0, '127.0.0.1', () => resolve())
  );
  const { port } = server.address() as AddressInfo;
  return {
    redirectUri: `http://127.0.0.1:${port}/callback`,
    received,
    close: () => server.close(),
  };
}

async function postToken(
  metadata: AuthServerMetadata,
  form: Record<string, string>
) {
  const res = await fetch(metadata.token_endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(form),
  });
  const body = (await res.json().catch(() => ({}))) as TokenResponse;
  if (!res.ok || !body.access_token) {
    const message =
      `Token request failed (HTTP ${res.status}): ${body.error ?? ''} ${body.error_description ?? ''}`.trim();
    // A refused refresh token: the login was revoked or has expired.
    throw body.error === 'invalid_grant'
      ? new OAuthLoginError('session_expired', message)
      : new Error(message);
  }
  return body;
}

/** Reads `org_id` from the access token without verifying it. */
function orgIdFromToken(accessToken: string): string | undefined {
  try {
    const payload = JSON.parse(
      Buffer.from(accessToken.split('.')[1], 'base64url').toString('utf-8')
    );
    return typeof payload.org_id === 'string' ? payload.org_id : undefined;
  } catch {
    return undefined;
  }
}

function toCredentials(
  apiUrl: string,
  tokens: TokenResponse,
  previous?: OAuthCredentials
): OAuthCredentials {
  return {
    kind: 'oauth',
    apiUrl,
    accessToken: tokens.access_token!,
    refreshToken: tokens.refresh_token ?? previous?.refreshToken,
    expiresAt: Date.now() + (tokens.expires_in ?? 3600) * 1000,
    scope: tokens.scope ?? previous?.scope,
    orgId: orgIdFromToken(tokens.access_token!),
  };
}

export async function authorize({
  apiUrl,
  signup,
  browser,
  onUrl,
  timeoutMs = LOGIN_TIMEOUT_MS,
}: {
  apiUrl: string;
  signup: boolean;
  browser: boolean;
  onUrl: (url: string) => void;
  timeoutMs?: number;
}): Promise<OAuthCredentials> {
  const { metadata, resource } = await discover(apiUrl);
  const verifier = base64url(randomBytes(32));
  const challenge = base64url(createHash('sha256').update(verifier).digest());
  const state = base64url(randomBytes(16));
  const loopback = await startLoopback(state);

  try {
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: CLIENT_ID,
      redirect_uri: loopback.redirectUri,
      scope: SCOPES,
      state,
      code_challenge: challenge,
      code_challenge_method: 'S256',
      resource,
    });
    if (signup) {
      // OpenID Connect Prompt Create 1.0
      params.set('prompt', 'create');
    }
    const url = `${metadata.authorization_endpoint}?${params}`;
    onUrl(url);
    if (browser) {
      openBrowser(url);
    }

    let timer: NodeJS.Timeout | undefined;
    const query = await Promise.race([
      loopback.received,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () =>
            reject(
              new OAuthLoginError(
                'timeout',
                'Timed out waiting for approval in the browser'
              )
            ),
          timeoutMs
        );
      }),
    ]).finally(() => clearTimeout(timer));

    if (query.get('state') !== state) {
      throw new OAuthLoginError(
        'authorization_failed',
        'Authorization response has a mismatched state'
      );
    }
    // RFC 9207: a response from another issuer is a mix-up attack.
    const iss = query.get('iss');
    if (iss && iss !== metadata.issuer) {
      throw new OAuthLoginError(
        'authorization_failed',
        `Authorization response came from issuer ${iss}`
      );
    }
    const error = query.get('error');
    if (error) {
      throw new OAuthLoginError(
        error === 'access_denied' ? 'access_denied' : 'authorization_failed',
        `Authorization refused: ${error} ${query.get('error_description') ?? ''}`.trim()
      );
    }
    const code = query.get('code');
    if (!code) {
      throw new OAuthLoginError(
        'authorization_failed',
        'Authorization response has no code'
      );
    }

    const tokens = await postToken(metadata, {
      grant_type: 'authorization_code',
      client_id: CLIENT_ID,
      code,
      redirect_uri: loopback.redirectUri,
      code_verifier: verifier,
      resource,
    });
    return toCredentials(apiUrl, tokens);
  } finally {
    loopback.close();
  }
}

export async function refresh(
  credentials: OAuthCredentials
): Promise<OAuthCredentials> {
  if (!credentials.refreshToken) {
    throw new OAuthLoginError(
      'session_expired',
      'The login has expired. Run "currents login" again.'
    );
  }
  const { metadata, resource } = await discover(credentials.apiUrl);
  const tokens = await postToken(metadata, {
    grant_type: 'refresh_token',
    client_id: CLIENT_ID,
    refresh_token: credentials.refreshToken,
    resource,
  });
  return toCredentials(credentials.apiUrl, tokens, credentials);
}

export async function revoke(credentials: OAuthCredentials) {
  const { metadata } = await discover(credentials.apiUrl);
  if (!metadata.revocation_endpoint || !credentials.refreshToken) {
    return;
  }
  await fetch(metadata.revocation_endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      token: credentials.refreshToken,
      token_type_hint: 'refresh_token',
    }),
  });
}
