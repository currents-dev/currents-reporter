import { debug as _debug } from '@debug';
import { info, success, warn } from '@logger';
import { getAuthHeaders, toApiError } from '../../api';
import { ClientType, getClient } from '../../http/client';
import {
  getRestAPIBaseUrl,
  requireRestAPIBaseUrl,
} from '../../http/httpConfig';
import { isHttpError } from '../../http/send';
import {
  deleteCredentials,
  getCredentialsPath,
  OAuthCredentials,
  readCredentials,
  writeCredentials,
} from './credentials';
import {
  authorize,
  canOpenBrowser,
  OAuthLoginError,
  printable,
  refresh,
  revoke,
} from './oauth';

const debug = _debug.extend('auth');

const REFRESH_MARGIN_MS = 60 * 1000;

const getApiUrl = () => requireRestAPIBaseUrl().replace(/\/+$/, '');

/**
 * The stored login for the REST API in use, refreshed when its access token
 * expires within a minute. Null when there is no login for that API: the
 * token of one installation is not sent to another.
 */
export async function getLoginCredentials(): Promise<OAuthCredentials | null> {
  const credentials = await readCredentials();
  if (!credentials) {
    return null;
  }
  const apiUrl = getRestAPIBaseUrl();
  if (
    !apiUrl ||
    new URL(credentials.apiUrl).origin !== new URL(apiUrl).origin
  ) {
    debug('The stored login is for another REST API URL');
    return null;
  }
  if (credentials.expiresAt - Date.now() > REFRESH_MARGIN_MS) {
    return credentials;
  }
  try {
    const refreshed = await refresh(credentials);
    await writeCredentials(refreshed);
    return refreshed;
  } catch (e) {
    if (e instanceof OAuthLoginError) {
      throw new Error(
        `The stored login has expired or was revoked (${e.message}). Run "currents login" again.`
      );
    }
    throw e;
  }
}

export async function handleLogin({
  browser,
  timeoutSeconds,
}: {
  browser: boolean;
  timeoutSeconds?: number;
}) {
  const apiUrl = getApiUrl();
  const openBrowser = browser && canOpenBrowser();
  const credentials = await authorize({
    apiUrl,
    browser: openBrowser,
    timeoutMs: timeoutSeconds ? timeoutSeconds * 1000 : undefined,
    onUrl: (url) =>
      info(
        `${openBrowser ? 'Opened' : 'Open'} this link to log in to Currents:\n\n  ${printable(url)}\n\nWaiting for approval in the browser…`
      ),
  });
  await writeCredentials(credentials);
  success(`Logged in to ${apiUrl}`);
  info(`Credentials saved to ${getCredentialsPath()}`);
}

export async function handleLogout() {
  const credentials = await readCredentials();
  if (!credentials) {
    info('Not logged in.');
    return;
  }
  let revoked = false;
  try {
    revoked = await revoke(credentials);
  } catch (e) {
    warn(`Could not revoke the login on the server: ${(e as Error).message}`);
  }
  await deleteCredentials();
  success('Logged out.');
  if (!revoked) {
    info('The login was not revoked on the server; it expires on its own.');
  }
}

type Organization = {
  orgId: string;
  name: string | null;
  role: string;
  current: boolean;
};

export async function handleWhoami() {
  const credentials = await getLoginCredentials();
  if (!credentials) {
    throw new Error(
      `Not logged in to ${getApiUrl()}. Run "currents login" first.`
    );
  }
  let organizations: Organization[];
  try {
    const res = await getClient(ClientType.REST_API).request<{
      data: Organization[];
    }>({
      method: 'GET',
      url: 'v1/me/organizations',
      headers: getAuthHeaders({ apiKey: credentials.accessToken }),
    });
    organizations = res.data.data;
  } catch (e) {
    if (isHttpError(e) && e.status === 401) {
      throw new Error(
        'The API refused the stored login: it was revoked or has expired. Run "currents login" again.'
      );
    }
    throw toApiError(e);
  }
  const org = organizations.find((o) => o.current);
  const lines = [
    `API:          ${credentials.apiUrl}`,
    `Organization: ${org ? `${org.name ?? '(no name)'} (${org.orgId}), ${org.role}` : '(unknown)'}`,
    `Scopes:       ${credentials.scope ?? '(unknown)'}`,
  ];
  lines.forEach((line) => info(printable(line)));
}
