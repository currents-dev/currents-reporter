import { sharedConfigKeys } from '../../config/keys';
import {
  DEFAULT_OIDC_API_AUDIENCE,
  DEFAULT_OIDC_AUDIENCE,
  getOidcApiAudience,
  getOidcAudience,
  requireRestAPIBaseUrl,
} from '../../http/httpConfig';
import { writeStdout } from '../../commands/utils';
import { getCiProvider } from '../../env/ciProvider';
import {
  API_TOKEN_KIND,
  exchangeOidcToken,
  findTokenSource,
  getCredentialKind,
  maskInGitHubLog,
  OidcCredential,
  OidcCredentialKind,
  OidcProvider,
  providedTokenSource,
  providerUnavailableMessage,
  RECORD_KEY_KIND,
  revokeOidcCredential,
  revokeOnExit,
  TokenSource,
} from '../../lib/oidc';

/** Read only by the api command; ci auth reads CURRENTS_OIDC_TOKEN. */
const OIDC_API_TOKEN_ENV = 'CURRENTS_OIDC_API_TOKEN';

export type CredentialFor = 'api' | 'record';

export const OIDC_TOKEN_ENV = 'CURRENTS_OIDC_TOKEN';

type CredentialSettings = {
  kind: OidcCredentialKind;
  /**
   * Also the start of the audience of a staging or on-prem install, followed
   * by a colon: exchange picks the kind by it.
   */
  defaultAudience: string;
  getAudience: (audience?: string) => string;
};

export const credentialSettings: Record<CredentialFor, CredentialSettings> = {
  api: {
    kind: API_TOKEN_KIND,
    defaultAudience: DEFAULT_OIDC_API_AUDIENCE,
    getAudience: (audience) => getOidcApiAudience(audience),
  },
  record: {
    kind: RECORD_KEY_KIND,
    defaultAudience: DEFAULT_OIDC_AUDIENCE,
    getAudience: (audience) => audience?.trim() || getOidcAudience(),
  },
};

export type CiAuthOptions = {
  projectId?: string;
  oidcApiAudience?: string;
  oidcProvider?: OidcProvider;
  audience?: string;
  json?: boolean;
  stdin?: boolean;
  debug?: boolean;
};

/** The CLI hides a token it reads in the GitHub log before sending it. */
const maskedSource = (source: TokenSource): TokenSource => ({
  ...source,
  getToken: async (env, audience) => {
    const token = await source.getToken(env, audience);
    maskInGitHubLog(token);
    return token;
  },
});

/**
 * Reads one token or credential from stdin. A value with whitespace inside is
 * refused: it is more than one value, or not a token.
 */
async function readStdin(name: string) {
  let data = '';
  process.stdin.setEncoding('utf8');
  for await (const chunk of process.stdin) data += chunk;
  const value = data.trim();
  if (!value || /\s/.test(value)) {
    throw new Error(`stdin must hold one ${name} and nothing else`);
  }
  return value;
}

function requireProjectId(options: CiAuthOptions) {
  const projectId = options.projectId?.trim();
  if (!projectId) {
    const { cli, env } = sharedConfigKeys.projectId;
    throw new Error(`Project ID is required: pass ${cli} or set ${env}`);
  }
  return projectId;
}

/** stdout gets only the credential, or the JSON, so that a script can read it. */
async function printCredential(
  credentialFor: CredentialFor,
  { credential, expiresAt, scope }: OidcCredential,
  json?: boolean
) {
  maskInGitHubLog(credential);
  if (!json) return writeStdout(`${credential}\n`);
  await writeStdout(
    `${JSON.stringify({
      token: credential,
      expires_at: expiresAt,
      ...(credentialFor === 'api'
        ? { scopes: scope?.split(/\s+/).filter(Boolean) ?? [] }
        : {}),
    })}\n`
  );
}

/** An OIDC token the CLI already holds, with the name messages give it. */
type HeldToken = { token: string; name: string };

async function exchangeAndPrint(
  credentialFor: CredentialFor,
  { token, name }: HeldToken,
  options: CiAuthOptions
) {
  const { kind } = credentialSettings[credentialFor];
  const projectId = requireProjectId(options);
  maskInGitHubLog(token);
  const credential = await exchangeOidcToken({
    kind,
    source: providedTokenSource(token, name),
    // A held token keeps the audience it was issued with.
    audience: '',
    projectId,
  });
  // Nothing revokes it on exit: the credential is for the commands after this one.
  await printCredential(credentialFor, credential, options.json);
}

type ProviderOptions = CiAuthOptions & { oidcProvider: OidcProvider };

/** The OIDC token of the provider of --oidc-provider, for the audience of the kind. */
async function requestProviderToken(
  credentialFor: CredentialFor,
  options: ProviderOptions
): Promise<HeldToken> {
  const provider = options.oidcProvider;
  const source = findTokenSource(provider);
  if (!source) throw new Error(providerUnavailableMessage(provider));
  const audience = credentialSettings[credentialFor].getAudience(
    options.audience
  );
  try {
    return {
      token: await source.getToken(process.env, audience),
      name: source.name,
    };
  } catch (e) {
    throw new Error(
      `Could not get the ${source.name}: ${(e as Error).message}`
    );
  }
}

const audiencesOf = (token: string): unknown[] => {
  try {
    const payload = JSON.parse(
      Buffer.from(token.split('.')[1] ?? '', 'base64url').toString('utf8')
    );
    return Array.isArray(payload?.aud) ? payload.aud : [payload?.aud];
  } catch {
    return [];
  }
};

/**
 * The kind of credential the audience of the token asks for. The token is
 * decoded, not verified: the server checks the audience and the trust policy.
 */
export function credentialForToken(token: string): CredentialFor {
  const matches = (Object.keys(credentialSettings) as CredentialFor[]).filter(
    (credentialFor) => {
      const { defaultAudience } = credentialSettings[credentialFor];
      return audiencesOf(token).some(
        (aud) =>
          typeof aud === 'string' &&
          (aud === defaultAudience || aud.startsWith(`${defaultAudience}:`))
      );
    }
  );
  if (matches.length === 1) return matches[0];
  const { api, record } = credentialSettings;
  throw new Error(
    matches.length === 0
      ? `The audience of the OIDC token is not ${api.defaultAudience} or ${record.defaultAudience}: pass --for api or --for record`
      : `The OIDC token has the audiences of both an API token and a record key: pass --for api or --for record`
  );
}

/**
 * The token for an API token in CURRENTS_OIDC_API_TOKEN, or else one the CLI
 * gets from the provider of --oidc-provider, or else from GitHub Actions. There
 * is no fallback when the selected source fails.
 */
export function findApiTokenSource(provider?: OidcProvider) {
  const token = process.env[OIDC_API_TOKEN_ENV]?.trim();
  if (token)
    return providedTokenSource(token, `token in ${OIDC_API_TOKEN_ENV}`);
  if (provider) return findTokenSource(provider);
  return getCiProvider() === 'githubActions' ? findTokenSource() : undefined;
}

/** A blank --api-key fails: it is not sent, and starts no exchange. */
export function rejectBlankApiKeyFlag(
  apiKey: string | undefined,
  apiKeySource: string | undefined
) {
  if (apiKeySource === 'cli' && !apiKey?.trim()) {
    throw new Error(
      `${sharedConfigKeys.apiKey.cli} is blank: pass the key, or leave the flag out`
    );
  }
}

/**
 * The API key of a command that calls the REST API: --api-key or
 * CURRENTS_API_KEY, or else an API token from the OIDC token of the CI job,
 * revoked when the command ends. A configured key is used even when the API
 * refuses it.
 */
export async function getApiKeyOrOidcToken(
  options: CiAuthOptions & { apiKey?: string },
  apiKeySource: string | undefined
) {
  rejectBlankApiKeyFlag(options.apiKey, apiKeySource);
  if (options.apiKey?.trim()) return options.apiKey;
  const source = findApiTokenSource(options.oidcProvider);
  if (!source) {
    if (options.oidcProvider) {
      throw new Error(providerUnavailableMessage(options.oidcProvider));
    }
    const { cli, env } = sharedConfigKeys.apiKey;
    throw new Error(
      `API key is required: pass ${cli} or set ${env}. Without a stored key, a CI job can use its OIDC token: set \`permissions: id-token: write\` on GitHub Actions, pass --oidc-provider google-cloud on Google Cloud, or on any other CI put a token with the audience ${getOidcApiAudience(options.oidcApiAudience)} in ${OIDC_API_TOKEN_ENV}, and pass --project-id`
    );
  }
  // Checked before the exchange: a token is not issued for a request that
  // cannot be sent.
  const projectId = requireProjectId(options);
  requireRestAPIBaseUrl();
  const { credential, expiresAt } = await exchangeOidcToken({
    kind: API_TOKEN_KIND,
    source: maskedSource(source),
    audience: getOidcApiAudience(options.oidcApiAudience),
    projectId,
  });
  maskInGitHubLog(credential);
  revokeOnExit(API_TOKEN_KIND, credential);
  process.stderr.write(
    `Using an API token from the ${source.name}, valid until ${expiresAt}\n`
  );
  return credential;
}

/** get-oidc-token, then exchange, in one process. */
export async function getCredentialHandler(
  credentialFor: CredentialFor,
  options: ProviderOptions
) {
  // No token is requested for an exchange that cannot be sent.
  requireProjectId(options);
  const token = await requestProviderToken(credentialFor, options);
  await exchangeAndPrint(credentialFor, token, options);
}

export async function getOidcTokenHandler(
  credentialFor: CredentialFor,
  options: ProviderOptions
) {
  const { token } = await requestProviderToken(credentialFor, options);
  maskInGitHubLog(token);
  await writeStdout(`${token}\n`);
}

/** The token from stdin, or else from CURRENTS_OIDC_TOKEN. */
export async function exchangeHandler(
  options: CiAuthOptions & { for?: CredentialFor }
) {
  let token: HeldToken | undefined;
  if (options.stdin) {
    token = { token: await readStdin('OIDC token'), name: 'token from stdin' };
  } else {
    const envToken = process.env[OIDC_TOKEN_ENV]?.trim();
    if (envToken)
      token = { token: envToken, name: `token in ${OIDC_TOKEN_ENV}` };
  }
  if (!token) {
    throw new Error(`No OIDC token: set ${OIDC_TOKEN_ENV} or pass --stdin`);
  }
  await exchangeAndPrint(
    options.for ?? credentialForToken(token.token),
    token,
    options
  );
}

/**
 * Revokes the credential from stdin, or the OIDC credentials in
 * CURRENTS_API_KEY and CURRENTS_RECORD_KEY. A key from the dashboard is not
 * revoked: the revoke endpoints answer 200 for it, but do nothing.
 */
export async function revokeHandler(options: CiAuthOptions) {
  const credentials = options.stdin
    ? [{ credential: await readStdin('credential'), from: 'stdin' }]
    : [sharedConfigKeys.apiKey.env, sharedConfigKeys.recordKey.env]
        .map((env) => ({
          credential: process.env[env]?.trim() ?? '',
          from: env,
        }))
        .filter(({ credential }) => credential);
  const revocable = credentials.flatMap(({ credential, from }) => {
    const kind = getCredentialKind(credential);
    if (kind) return [{ credential, kind }];
    if (options.stdin) {
      throw new Error(
        `The credential from stdin is not an OIDC ${API_TOKEN_KIND.name} (${API_TOKEN_KIND.prefix}) or ${RECORD_KEY_KIND.name} (${RECORD_KEY_KIND.prefix})`
      );
    }
    process.stderr.write(`${from} is not from an OIDC exchange: skipped\n`);
    return [];
  });
  if (revocable.length === 0) {
    throw new Error(
      `No OIDC credential to revoke: pass an ${API_TOKEN_KIND.name} (${API_TOKEN_KIND.prefix}) or ${RECORD_KEY_KIND.name} (${RECORD_KEY_KIND.prefix}) on stdin with --stdin, or in ${sharedConfigKeys.apiKey.env} or ${sharedConfigKeys.recordKey.env}`
    );
  }
  const failures: string[] = [];
  for (const { credential, kind } of revocable) {
    maskInGitHubLog(credential);
    try {
      await revokeOidcCredential(kind, credential);
      process.stderr.write(`Revoked the ${kind.name}\n`);
    } catch (e) {
      failures.push((e as Error).message);
    }
  }
  if (failures.length > 0) throw new Error(failures.join('\n'));
}
