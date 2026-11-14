import { CommandUnknownOpts } from '@commander-js/extra-typings';
import { error, warn } from '@logger';
import { setTimeout as sleep } from 'node:timers/promises';
import { debug as _debug, enableDebug } from '../debug';
import { printLogsToStderr } from '../commands/utils';
import { addExitHook } from './exitHooks';
import { ClientType, getClient } from '../http/client';
import { getOidcAudience, getTimeout } from '../http/httpConfig';
import {
  formatDuration,
  getDelay,
  getMaxRetries,
  isRetriableError,
} from '../http/httpRetry';
import { makeRequest } from '../http/http';
import { HttpError, isHttpError, sendRequest } from '../http/send';

const debug = _debug.extend('oidc');

const REVOKE_TIMEOUT_MS = 5000;

const GRANT_TYPE = 'urn:ietf:params:oauth:grant-type:token-exchange';
const SUBJECT_TOKEN_TYPE = 'urn:ietf:params:oauth:token-type:jwt';

/** The response of an OAuth 2.0 Token Exchange (RFC 8693). */
type TokenExchangeResponse = {
  access_token: string;
  /** Seconds */
  expires_in: number;
};

type OidcRecordKey = {
  recordKey: string;
  /** ISO-8601 */
  expiresAt: string;
};

type TokenSource = {
  /** Names the token in messages: "the <name>". */
  name: string;
  isAvailable: (env: NodeJS.ProcessEnv) => boolean;
  getToken: (env: NodeJS.ProcessEnv) => Promise<string>;
};

const isGitHubActions = (env: NodeJS.ProcessEnv) =>
  env.GITHUB_ACTIONS === 'true';

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
      });
    } catch (e) {
      if (retryCount >= getMaxRetries() || !isRetriableError(e as Error)) {
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

async function getGitHubToken(env: NodeJS.ProcessEnv) {
  const url = new URL(env.ACTIONS_ID_TOKEN_REQUEST_URL as string);
  url.searchParams.set('audience', getOidcAudience());
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
 * `id_tokens`), from --oidc-token or CURRENTS_OIDC_TOKEN.
 */
const providedTokenSource = (token: string): TokenSource => ({
  name: 'token in --oidc-token or CURRENTS_OIDC_TOKEN',
  isAvailable: () => true,
  getToken: async () => token,
});

/** The sources the CLI finds by itself, in the order they are tried. */
const tokenSources: TokenSource[] = [
  {
    name: 'GitHub Actions OIDC token',
    // GitHub sets both variables only for a job with `id-token: write`.
    isAvailable: (env) =>
      isSet(env, 'ACTIONS_ID_TOKEN_REQUEST_URL') &&
      isSet(env, 'ACTIONS_ID_TOKEN_REQUEST_TOKEN'),
    getToken: getGitHubToken,
  },
];

export function findTokenSource(env: NodeJS.ProcessEnv = process.env) {
  return tokenSources.find((source) => source.isAvailable(env));
}

/**
 * One attempt without the retries of the API client: the key expires on its
 * own, so a failure only gets a debug line.
 */
async function revokeRecordKey(recordKey: string) {
  try {
    await getClient(ClientType.API).request({
      method: 'POST',
      url: 'oidc/revoke',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      data: new URLSearchParams({
        token: recordKey,
        token_type_hint: 'access_token',
      }).toString(),
      timeout: REVOKE_TIMEOUT_MS,
      maxRetries: 0,
    });
    debug('Revoked the record key from OIDC');
  } catch (e) {
    debug(
      'Could not revoke the record key from OIDC: %s',
      (e as Error).message
    );
  }
}

/** `error_description` of the OAuth error, then `error`, then the HTTP error message. */
function getServerMessage(e: unknown) {
  if (!isHttpError(e)) return (e as Error).message;
  const { error_description, error } = e.response?.data ?? {};
  return (
    [error_description, error].find(
      (value) => typeof value === 'string' && value
    ) ?? e.message
  );
}

/**
 * Exchanges the OIDC token of the job for a short-lived record key. The
 * exchange runs once per process: later calls get the same key.
 */
let exchange: Promise<OidcRecordKey> | undefined;

export function getRecordKeyFromOidc(
  source: TokenSource,
  env: NodeJS.ProcessEnv = process.env
) {
  exchange ??= (async () => {
    let token: string;
    try {
      token = await source.getToken(env);
    } catch (e) {
      throw new Error(
        `Could not get the ${source.name}: ${(e as Error).message}`
      );
    }
    try {
      const res = await makeRequest<TokenExchangeResponse>(ClientType.API, {
        method: 'POST',
        url: 'oidc/token',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        data: new URLSearchParams({
          grant_type: GRANT_TYPE,
          subject_token: token,
          subject_token_type: SUBJECT_TOKEN_TYPE,
        }).toString(),
      });
      const { access_token, expires_in } = res.data ?? {};
      if (!access_token || !Number.isFinite(expires_in)) {
        throw new Error('the response has no access token or expiry');
      }
      // The key is valid only while the command runs.
      addExitHook(() => revokeRecordKey(access_token));
      return {
        recordKey: access_token,
        expiresAt: new Date(Date.now() + expires_in * 1000).toISOString(),
      };
    } catch (e) {
      throw new Error(
        `Could not exchange the ${source.name} for a record key: ${getServerMessage(e)}`
      );
    }
  })();
  return exchange;
}

/** For tests. */
export function resetOidcExchange() {
  exchange = undefined;
}

/**
 * A command with `--key` that got no record key, and no API key to use
 * instead, gets one from an OIDC token: --oidc-token, CURRENTS_OIDC_TOKEN, or
 * GitHub Actions. The commands that take
 * only an API key have no `--key` option and are not affected.
 */
export async function useOidcRecordKey(command: CommandUnknownOpts) {
  const hasOption = (long: string) =>
    command.options.some((o) => o.long === long);
  const oidcToken = String(command.getOptionValue('oidcToken') ?? '').trim();
  // The value is not kept in the options, which commands copy into their
  // config and print with --debug.
  if (hasOption('--oidc-token')) {
    command.setOptionValueWithSource('oidcToken', undefined, 'config');
  }
  if (
    !hasOption('--key') ||
    command.getOptionValue('key') ||
    (hasOption('--api-key') && command.getOptionValue('apiKey'))
  ) {
    return;
  }
  const source = oidcToken ? providedTokenSource(oidcToken) : findTokenSource();
  if (!source) return;
  // The command handler enables debug later, after the exchange.
  if (command.getOptionValue('debug')) enableDebug();
  // The retry warnings of the exchange would come before the JSON output.
  if (command.getOptionValue('json')) printLogsToStderr();
  try {
    const { recordKey, expiresAt } = await getRecordKeyFromOidc(source);
    command.setOptionValueWithSource('key', recordKey, 'config');
    // GitHub masks a secret in the log only when it knows it: a key from the
    // exchange is not one. The runner reads the command from stderr too.
    if (isGitHubActions(process.env)) {
      process.stderr.write(`::add-mask::${recordKey}\n`);
    }
    // stderr: `session start --json` prints JSON on stdout.
    process.stderr.write(
      `Using a record key from the ${source.name}, valid until ${expiresAt}\n`
    );
  } catch (e) {
    error((e as Error).message);
    process.exit(1);
  }
}
