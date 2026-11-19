import { warn } from '@logger';
import { execFile } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { promisify } from 'node:util';
import { debug as _debug } from '../debug';
import { ClientType, getClient } from '../http/client';
import { getTimeout } from '../http/httpConfig';
import {
  formatDuration,
  getDelay,
  getMaxRetries,
  isRetriableError,
} from '../http/httpRetry';
import { HttpError, isHttpError, sendRequest } from '../http/send';
import { redactSecret } from './credentials';

const debug = _debug.extend('oidc');

const REVOKE_TIMEOUT_MS = 5000;

const GRANT_TYPE = 'urn:ietf:params:oauth:grant-type:token-exchange';
const SUBJECT_TOKEN_TYPE = 'urn:ietf:params:oauth:token-type:jwt';

/** The response of an OAuth 2.0 Token Exchange (RFC 8693). */
type TokenExchangeResponse = {
  access_token: string;
  /** Seconds */
  expires_in: number;
  /** Space-separated. The record key exchange does not send it. */
  scope?: string;
};

/** A credential the Currents API issues for an OIDC token, and its endpoints. */
export type OidcCredentialKind = {
  /** Names the credential in messages: "<article> <name>". */
  name: string;
  article: 'a' | 'an';
  tokenPath: string;
  revokePath: string;
  /** The start of every credential of the kind. */
  prefix: string;
};

export const RECORD_KEY_KIND: OidcCredentialKind = {
  name: 'record key',
  article: 'a',
  tokenPath: 'oidc/token',
  revokePath: 'oidc/revoke',
  prefix: 'crnts_ci_',
};

export const API_TOKEN_KIND: OidcCredentialKind = {
  name: 'API token',
  article: 'an',
  tokenPath: 'oidc/api/token',
  revokePath: 'oidc/api/revoke',
  prefix: 'crnts_ciapi_',
};

/** Undefined for a credential that no OIDC exchange issues, such as a dashboard key. */
export const getCredentialKind = (credential: string) =>
  [RECORD_KEY_KIND, API_TOKEN_KIND].find((kind) =>
    credential.startsWith(kind.prefix)
  );

export type OidcCredential = {
  credential: string;
  /** ISO-8601 */
  expiresAt: string;
  scope?: string;
};

export type TokenSource = {
  /** Names the token in messages: "the <name>". */
  name: string;
  isAvailable: (env: NodeJS.ProcessEnv) => boolean;
  getToken: (env: NodeJS.ProcessEnv, audience: string) => Promise<string>;
};

const isGitHubActions = (env: NodeJS.ProcessEnv) =>
  env.GITHUB_ACTIONS === 'true';

/**
 * GitHub hides a secret in the job log only when it knows it. The runner reads
 * the workflow command from stderr too. The escapes are the ones of GitHub
 * workflow commands: without them a newline would end the command early.
 */
export function maskInGitHubLog(secret: string, env = process.env) {
  if (!isGitHubActions(env)) return;
  const escaped = secret
    .replace(/%/g, '%25')
    .replace(/\r/g, '%0D')
    .replace(/\n/g, '%0A');
  process.stderr.write(`::add-mask::${escaped}\n`);
}

const isSet = (env: NodeJS.ProcessEnv, name: string) =>
  Boolean(env[name]?.trim());

/**
 * Retries as the Currents API client does. The warning does not name the URL
 * of the request.
 */
async function requestGitHubToken(url: string, requestToken: string) {
  for (let retryCount = 0; ; retryCount++) {
    try {
      return await sendRequest<{ value?: string }>({
        method: 'GET',
        url,
        headers: { authorization: `bearer ${requestToken}` },
        timeout: getTimeout(),
        responseType: 'json',
        followRedirects: false,
      });
    } catch (e) {
      if (
        retryCount >= getMaxRetries() ||
        !isRetriableError(e as Error, { logResponse: false })
      ) {
        throw e;
      }
      warn(
        "Request for the GitHub OIDC token failed: '%s'. Next attempt is in %s (%d/%d).",
        (e as Error).message,
        formatDuration(getDelay(retryCount + 1, e as HttpError)),
        retryCount + 1,
        getMaxRetries()
      );
      await sleep(getDelay(retryCount + 1, e as HttpError));
    }
  }
}

async function getGitHubToken(env: NodeJS.ProcessEnv, audience: string) {
  const url = new URL(env.ACTIONS_ID_TOKEN_REQUEST_URL as string);
  url.searchParams.set('audience', audience);
  const res = await requestGitHubToken(
    url.href,
    env.ACTIONS_ID_TOKEN_REQUEST_TOKEN as string
  );
  if (!res.data?.value) {
    throw new Error('the response has no token');
  }
  return res.data.value;
}

/**
 * A token the job gets itself, on any provider (for example GitLab CI
 * `id_tokens`). Its audience is the one the job asked for, not the one passed
 * to `getToken`.
 */
export const providedTokenSource = (
  token: string,
  name: string
): TokenSource => ({
  name,
  isAvailable: () => true,
  getToken: async () => token,
});

export const OIDC_PROVIDERS = [
  'github-actions',
  'google-cloud',
  'circleci',
  'buildkite',
] as const;
export type OidcProvider = (typeof OIDC_PROVIDERS)[number];
export const OIDC_PROVIDER_ENV = 'CURRENTS_OIDC_PROVIDER';

const GOOGLE_METADATA_HOST = 'metadata.google.internal';

/**
 * The GKE metadata server can take a few seconds to answer after the pod
 * starts. Changed by tests.
 */
export const googleMetadataRequest = {
  attempts: 5,
  delayMs: 1000,
  timeoutMs: 2000,
};

/** A host name, an IPv4 address or an IPv6 address in brackets, and a port. */
const HOST_AND_PORT = /^(?:[A-Za-z0-9.-]+|\[[0-9A-Fa-f:.]+\])(?::\d{1,5})?$/;

/**
 * GCE_METADATA_HOST is the variable the Google Cloud client libraries read.
 * Only a host and a port: a path, query or fragment in it would choose
 * another endpoint, such as the token endpoint for `ci auth status`.
 */
export function getGoogleMetadataHost(env: NodeJS.ProcessEnv = process.env) {
  const host = env.GCE_METADATA_HOST?.trim();
  if (!host) return GOOGLE_METADATA_HOST;
  if (!HOST_AND_PORT.test(host)) {
    throw new Error(
      'GCE_METADATA_HOST must be a host name or IP address with an optional port, such as metadata.google.internal or 169.254.169.254:80'
    );
  }
  return host;
}

const GOOGLE_UNREACHABLE_HINT =
  'the CLI gets this token only on Google Cloud. On GKE, the pod needs a Kubernetes service account bound to a Google service account with Workload Identity';

const GOOGLE_STATUS_HINTS: Record<number, string> = {
  403: 'the service account may lack permission to mint ID tokens, or Workload Identity is not set up',
  404: 'the VM or the GKE pod may have no Google service account',
};

/** `status` is undefined when the metadata server did not answer. */
export class GoogleMetadataError extends Error {
  constructor(
    message: string,
    public host: string,
    public status?: number
  ) {
    super(message);
  }
}

/**
 * A GET to the metadata server, as text. A network error or a 5xx is tried
 * again; the error of the last attempt says what to check.
 */
export async function requestGoogleMetadata(
  path: string,
  query?: URLSearchParams,
  env: NodeJS.ProcessEnv = process.env
) {
  const host = getGoogleMetadataHost(env);
  const url = new URL(`http://${host}`);
  url.pathname = `/computeMetadata/v1/${path}`;
  url.search = query?.toString() ?? '';
  const { attempts, delayMs, timeoutMs } = googleMetadataRequest;
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await sendRequest<string>({
        method: 'GET',
        url: url.href,
        headers: { 'metadata-flavor': 'Google' },
        timeout: timeoutMs,
        deadline: timeoutMs,
        responseType: 'text',
        followRedirects: false,
        // The metadata server answers only inside the VM or the pod.
        bypassProxy: true,
      });
      return String(res.data ?? '').trim();
    } catch (e) {
      const status = isHttpError(e) ? e.status : undefined;
      const retriable = status === undefined || status >= 500;
      if (!retriable || attempt >= attempts) {
        throw googleMetadataError(e, host);
      }
      debug(
        'The Google Cloud metadata server did not answer: %s. Attempt %d of %d',
        (e as Error).message,
        attempt,
        attempts
      );
      await sleep(delayMs);
    }
  }
}

function googleMetadataError(e: unknown, host: string) {
  const response = isHttpError(e) ? e.response : undefined;
  if (!response) {
    return new GoogleMetadataError(
      `the Google Cloud metadata server at ${host} is unreachable (${(e as Error).message}): ${GOOGLE_UNREACHABLE_HINT}`,
      host
    );
  }
  // The body is not repeated: it is whatever the server at the host sent,
  // and the message is printed.
  const hint = GOOGLE_STATUS_HINTS[response.status];
  return new GoogleMetadataError(
    `the Google Cloud metadata server at ${host} answered ${response.status}${hint ? `: ${hint}` : ''}`,
    host,
    response.status
  );
}

/**
 * `format=full` adds the claims of the VM or the GKE cluster to the token.
 * The audience does not have to be a URL.
 */
async function getGoogleToken(env: NodeJS.ProcessEnv, audience: string) {
  const token = await requestGoogleMetadata(
    'instance/service-accounts/default/identity',
    new URLSearchParams({ audience, format: 'full' }),
    env
  );
  if (!token) throw new Error('the response has no token');
  return token;
}

const githubTokenSource: TokenSource = {
  name: 'GitHub Actions OIDC token',
  // GitHub sets both variables only for a job with `id-token: write`.
  isAvailable: (env) =>
    isSet(env, 'ACTIONS_ID_TOKEN_REQUEST_URL') &&
    isSet(env, 'ACTIONS_ID_TOKEN_REQUEST_TOKEN'),
  getToken: getGitHubToken,
};

/** Nothing tells the CLI it runs on Google Cloud: the token request fails off it. */
const googleTokenSource: TokenSource = {
  name: 'Google Cloud OIDC token',
  isAvailable: () => true,
  getToken: getGoogleToken,
};

const execFileAsync = promisify(execFile);

/** Changed by tests. */
export const tokenCommand = { timeoutMs: 30_000 };

/**
 * Runs the token command of the CI provider without a shell and returns its
 * stdout. Errors name the executable and the exit status only: the output of
 * the command can hold the token.
 */
export async function runTokenCommand(
  file: string,
  args: string[],
  env: NodeJS.ProcessEnv
) {
  let stdout: string;
  try {
    ({ stdout } = await execFileAsync(file, args, {
      env,
      encoding: 'utf8',
      windowsHide: true,
      timeout: tokenCommand.timeoutMs,
      killSignal: 'SIGKILL',
    }));
  } catch (e) {
    const { code, signal, killed } = e as {
      code?: number | string;
      signal?: string;
      killed?: boolean;
    };
    if (code === 'ENOENT') throw new Error(`${file} is not on the PATH`);
    if (killed) {
      throw new Error(
        `${file} did not answer within ${tokenCommand.timeoutMs / 1000} seconds`
      );
    }
    if (typeof code === 'number') {
      throw new Error(`${file} exited with status ${code}`);
    }
    if (signal) throw new Error(`${file} was stopped by ${signal}`);
    throw new Error(`${file} could not run`);
  }
  const token = stdout.trim();
  if (!token || /\s/.test(token)) {
    throw new Error(`${file} did not print one token`);
  }
  return token;
}

/** The CircleCI CLI sets the audience as a custom claim. */
const circleciTokenSource: TokenSource = {
  name: 'CircleCI OIDC token',
  isAvailable: () => true,
  getToken: (env, audience) =>
    runTokenCommand(
      'circleci',
      ['run', 'oidc', 'get', '--claims', JSON.stringify({ aud: audience })],
      env
    ),
};

const buildkiteTokenSource: TokenSource = {
  name: 'Buildkite OIDC token',
  isAvailable: () => true,
  getToken: (env, audience) =>
    runTokenCommand(
      'buildkite-agent',
      ['oidc', 'request-token', '--audience', audience],
      env
    ),
};

const providerTokenSources: Record<OidcProvider, TokenSource> = {
  'github-actions': githubTokenSource,
  'google-cloud': googleTokenSource,
  circleci: circleciTokenSource,
  buildkite: buildkiteTokenSource,
};

/** The source of the provider. Undefined when that source is not available. */
export function findTokenSource(
  provider: OidcProvider,
  env: NodeJS.ProcessEnv = process.env
) {
  const source = providerTokenSources[provider];
  return source.isAvailable(env) ? source : undefined;
}

/** Only the GitHub source can be unavailable. */
export const providerUnavailableMessage = (provider: OidcProvider) =>
  `The OIDC provider is ${provider} (--oidc-provider or ${OIDC_PROVIDER_ENV}), but the ${providerTokenSources[provider].name} is not available: the GitHub Actions job needs \`permissions: id-token: write\``;

/**
 * One attempt without the retries of the API client: the credential expires on
 * its own. The server answers 200 for a credential it does not know too.
 */
export async function revokeOidcCredential(
  kind: OidcCredentialKind,
  credential: string
) {
  try {
    await getClient(ClientType.API).request({
      method: 'POST',
      url: kind.revokePath,
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      data: new URLSearchParams({
        token: credential,
        token_type_hint: 'access_token',
      }).toString(),
      timeout: REVOKE_TIMEOUT_MS,
      // A body that keeps coming would hold the command open past the timeout.
      deadline: REVOKE_TIMEOUT_MS,
      maxRetries: 0,
      followRedirects: false,
      logErrorResponse: false,
    });
    debug('Revoked the %s from OIDC', kind.name);
  } catch (e) {
    throw new Error(
      `Could not revoke the ${kind.name} from OIDC: ${getServerMessage(e, credential)}`
    );
  }
}

/**
 * `error_description` of the OAuth error, then `error`, then the HTTP error
 * message, with the secret replaced by '*****': a server can repeat the token
 * it got, and the message is printed.
 */
function getServerMessage(e: unknown, secret: string) {
  const { error_description, error } = isHttpError(e)
    ? (e.response?.data ?? {})
    : {};
  const message: string =
    [error_description, error].find(
      (value) => typeof value === 'string' && value
    ) ?? (e as Error).message;
  return redactSecret(message, secret);
}

/**
 * Gets the OIDC token of the job for the audience and exchanges it for a
 * credential of the kind. Every call exchanges again, and nothing revokes the
 * credential: the caller decides.
 */
export async function exchangeOidcToken({
  kind,
  source,
  audience,
  policyId,
  env = process.env,
}: {
  kind: OidcCredentialKind;
  source: TokenSource;
  audience: string;
  policyId: string;
  env?: NodeJS.ProcessEnv;
}): Promise<OidcCredential> {
  let token: string;
  try {
    token = await source.getToken(env, audience);
  } catch (e) {
    throw new Error(
      `Could not get the ${source.name}: ${(e as Error).message}`
    );
  }
  try {
    // Not makeRequest: its warning prints the error body, which can repeat
    // the token.
    const res = await getClient(ClientType.API).request<TokenExchangeResponse>({
      method: 'POST',
      url: kind.tokenPath,
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      data: new URLSearchParams({
        grant_type: GRANT_TYPE,
        subject_token: token,
        subject_token_type: SUBJECT_TOKEN_TYPE,
        policy_id: policyId,
      }).toString(),
      followRedirects: false,
      logErrorResponse: false,
    });
    const { access_token, expires_in, scope } = res.data ?? {};
    if (
      typeof access_token !== 'string' ||
      !access_token ||
      typeof expires_in !== 'number' ||
      !Number.isFinite(expires_in)
    ) {
      throw new Error('the response has no access token or expiry');
    }
    return {
      credential: access_token,
      expiresAt: new Date(Date.now() + expires_in * 1000).toISOString(),
      ...(typeof scope === 'string' ? { scope } : {}),
    };
  } catch (e) {
    throw new Error(
      `Could not exchange the ${source.name} for ${kind.article} ${kind.name}: ${getServerMessage(e, token)}`
    );
  }
}
