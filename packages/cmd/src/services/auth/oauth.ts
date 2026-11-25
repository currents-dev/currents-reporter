import { debug as _debug } from '@debug';
import { redactSecret } from '@lib';
import { spawn } from 'child_process';
import { createHash, randomBytes } from 'crypto';
import http from 'http';
import { AddressInfo } from 'net';
import { getTimeout } from '../../http/httpConfig';
import { isHttpError, sendRequest } from '../../http/send';
import { OAuthCredentials } from './credentials';

const debug = _debug.extend('auth');

export const CLIENT_ID = 'currents-cli';
/** The scopes the API lists for `currents-cli`; asking for more fails with invalid_scope. */
export const SCOPES = 'openid offline_access projects:read results:read';
export const LOGIN_TIMEOUT_MS = 10 * 60 * 1000;

/** The login was refused, expired or cannot be used; `currents login` fixes it. */
export class OAuthLoginError extends Error {}

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
};

/**
 * Server text without control characters, so that it cannot move the cursor
 * or rewrite earlier lines of the terminal. Line breaks and tabs stay.
 */
export const printable = (text: string) =>
  text.replace(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/g, '');

async function getJson<T>(url: string): Promise<T> {
  const res = await sendRequest<T>({
    method: 'GET',
    url,
    timeout: getTimeout(),
    followRedirects: false,
  });
  return res.data;
}

/**
 * Posts a form and returns the JSON answer. The error names only the
 * `error` and `error_description` of the answer: the HttpError holds the form,
 * which carries a token.
 */
async function postForm<T>(
  url: string,
  form: Record<string, string>,
  secrets: string[]
) {
  try {
    const res = await sendRequest<T>({
      method: 'POST',
      url,
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(form).toString(),
      timeout: getTimeout(),
      followRedirects: false,
    });
    return res.data;
  } catch (e) {
    const { error, error_description } =
      (isHttpError(e) && e.response?.data) || {};
    const status = isHttpError(e) ? e.status : undefined;
    let message = status
      ? `${new URL(url).pathname} answered HTTP ${status}: ${error ?? ''} ${error_description ?? ''}`.trim()
      : `${new URL(url).pathname} failed: ${isHttpError(e) ? e.code : (e as Error).message}`;
    message = printable(secrets.reduce(redactSecret, message));
    // A refused code or refresh token: the login was revoked or has expired.
    throw error === 'invalid_grant'
      ? new OAuthLoginError(message)
      : new Error(message);
  }
}

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
    throw new Error(
      `${api.origin} advertised ${name} at ${printable(url.origin)}, which is not the API's own HTTPS origin`
    );
  }
}

/**
 * The RFC 8414 document of the authorization server, and the `resource` of
 * the RFC 9728 document, which every authorize and token request carries.
 */
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
    spawn(command, [url], { detached: true, stdio: 'ignore' })
      .on('error', (e) => debug('Could not open a browser: %o', e))
      .unref();
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
 * loopback IPs) and resolves with the query of the first /callback request
 * that carries `state`.
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

function toCredentials(
  apiUrl: string,
  tokens: TokenResponse,
  previous?: OAuthCredentials
): OAuthCredentials {
  if (!tokens.access_token) {
    throw new Error('The token response has no access token');
  }
  return {
    apiUrl,
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token ?? previous?.refreshToken,
    expiresAt: Date.now() + (tokens.expires_in ?? 3600) * 1000,
    scope: tokens.scope ?? previous?.scope,
  };
}

/** Loopback authorization code flow with PKCE (RFC 8252, RFC 7636). */
export async function authorize({
  apiUrl,
  browser,
  onUrl,
  timeoutMs = LOGIN_TIMEOUT_MS,
}: {
  apiUrl: string;
  browser: boolean;
  onUrl: (url: string) => void;
  timeoutMs?: number;
}): Promise<OAuthCredentials> {
  const { metadata, resource } = await discover(apiUrl);
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  const state = randomBytes(16).toString('base64url');
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
              new Error(
                'Timed out waiting for approval in the browser. Run "currents login" again.'
              )
            ),
          timeoutMs
        );
      }),
    ]).finally(() => clearTimeout(timer));

    // RFC 9207: a response from another issuer is a mix-up attack.
    const iss = query.get('iss');
    if (iss && iss !== metadata.issuer) {
      throw new Error(
        `The authorization response came from issuer ${printable(iss)}`
      );
    }
    const error = query.get('error');
    if (error) {
      throw new Error(
        printable(
          `Authorization refused: ${error} ${query.get('error_description') ?? ''}`.trim()
        )
      );
    }
    const code = query.get('code');
    if (!code) {
      throw new Error('The authorization response has no code');
    }

    const tokens = await postForm<TokenResponse>(
      metadata.token_endpoint,
      {
        grant_type: 'authorization_code',
        client_id: CLIENT_ID,
        code,
        redirect_uri: loopback.redirectUri,
        code_verifier: verifier,
        resource,
      },
      [code, verifier]
    );
    return toCredentials(apiUrl, tokens);
  } finally {
    loopback.close();
  }
}

export async function refresh(
  credentials: OAuthCredentials
): Promise<OAuthCredentials> {
  if (!credentials.refreshToken) {
    throw new OAuthLoginError('The login has expired');
  }
  const { metadata, resource } = await discover(credentials.apiUrl);
  const tokens = await postForm<TokenResponse>(
    metadata.token_endpoint,
    {
      grant_type: 'refresh_token',
      client_id: CLIENT_ID,
      refresh_token: credentials.refreshToken,
      resource,
    },
    [credentials.refreshToken]
  );
  return toCredentials(credentials.apiUrl, tokens, credentials);
}

/** False when the server has no revocation endpoint or there is no refresh token. */
export async function revoke(credentials: OAuthCredentials) {
  const { metadata } = await discover(credentials.apiUrl);
  if (!metadata.revocation_endpoint || !credentials.refreshToken) {
    return false;
  }
  await postForm(
    metadata.revocation_endpoint,
    {
      client_id: CLIENT_ID,
      token: credentials.refreshToken,
      token_type_hint: 'refresh_token',
    },
    [credentials.refreshToken]
  );
  return true;
}
