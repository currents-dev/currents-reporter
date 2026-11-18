import { sharedConfigKeys } from '../../config/keys';
import {
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

export type CredentialFor = 'api' | 'record';

type CredentialSettings = {
  kind: OidcCredentialKind;
  /** The variable a job puts its OIDC token in, on any CI provider. */
  tokenEnv: string;
  getAudience: (options: CiAuthOptions) => string;
};

export const credentialSettings: Record<CredentialFor, CredentialSettings> = {
  api: {
    kind: API_TOKEN_KIND,
    tokenEnv: 'CURRENTS_OIDC_API_TOKEN',
    getAudience: (options) => getOidcApiAudience(options.oidcApiAudience),
  },
  record: {
    kind: RECORD_KEY_KIND,
    tokenEnv: 'CURRENTS_OIDC_TOKEN',
    // The preAction hook of the program sets it from --oidc-audience.
    getAudience: () => getOidcAudience(),
  },
};

export type CiAuthOptions = {
  projectId?: string;
  oidcApiAudience?: string;
  oidcProvider?: OidcProvider;
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

async function exchangeAndPrint(
  credentialFor: CredentialFor,
  source: TokenSource,
  options: CiAuthOptions
) {
  const settings = credentialSettings[credentialFor];
  const credential = await exchangeOidcToken({
    kind: settings.kind,
    source: maskedSource(source),
    audience: settings.getAudience(options),
    projectId: requireProjectId(options),
  });
  // Nothing revokes it on exit: the credential is for the commands after this one.
  await printCredential(credentialFor, credential, options.json);
}

/**
 * The OIDC token in the variable of the kind, or else one the CLI gets from
 * the provider of --oidc-provider, or else from GitHub Actions. There is no
 * fallback when the selected source fails.
 */
export function findCiTokenSource(
  credentialFor: CredentialFor,
  provider?: OidcProvider
) {
  const { tokenEnv } = credentialSettings[credentialFor];
  const token = process.env[tokenEnv]?.trim();
  if (token) return providedTokenSource(token, `token in ${tokenEnv}`);
  if (provider) return findTokenSource(provider);
  return getCiProvider() === 'githubActions' ? findTokenSource() : undefined;
}

function noOidcTokenHint(credentialFor: CredentialFor, options: CiAuthOptions) {
  const { tokenEnv, getAudience } = credentialSettings[credentialFor];
  return `set \`permissions: id-token: write\` on GitHub Actions, pass --oidc-provider google on Google Cloud, or on any other CI put a token with the audience ${getAudience(options)} in ${tokenEnv}`;
}

function requireCiTokenSource(
  credentialFor: CredentialFor,
  options: CiAuthOptions
) {
  const source = findCiTokenSource(credentialFor, options.oidcProvider);
  if (source) return source;
  if (options.oidcProvider) {
    throw new Error(providerUnavailableMessage(options.oidcProvider));
  }
  const { kind } = credentialSettings[credentialFor];
  throw new Error(
    `No OIDC token for ${kind.article} ${kind.name}: ${noOidcTokenHint(credentialFor, options)}`
  );
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
  const source = findCiTokenSource('api', options.oidcProvider);
  if (!source) {
    if (options.oidcProvider) {
      throw new Error(providerUnavailableMessage(options.oidcProvider));
    }
    const { cli, env } = sharedConfigKeys.apiKey;
    throw new Error(
      `API key is required: pass ${cli} or set ${env}. Without a stored key, a CI job can use its OIDC token: ${noOidcTokenHint('api', options)}, and pass --project-id`
    );
  }
  // Checked before the exchange: a token is not issued for a request that
  // cannot be sent.
  const projectId = requireProjectId(options);
  requireRestAPIBaseUrl();
  const { credential, expiresAt } = await exchangeOidcToken({
    kind: API_TOKEN_KIND,
    source: maskedSource(source),
    audience: credentialSettings.api.getAudience(options),
    projectId,
  });
  maskInGitHubLog(credential);
  revokeOnExit(API_TOKEN_KIND, credential);
  process.stderr.write(
    `Using an API token from the ${source.name}, valid until ${expiresAt}\n`
  );
  return credential;
}

export async function getCredentialHandler(
  credentialFor: CredentialFor,
  options: CiAuthOptions
) {
  const source = requireCiTokenSource(credentialFor, options);
  await exchangeAndPrint(credentialFor, source, options);
}

/**
 * Prints the OIDC token itself. A token from the variable is printed as it
 * is: its audience is the one the job asked for.
 */
export async function getOidcTokenHandler(
  credentialFor: CredentialFor,
  options: CiAuthOptions
) {
  if (!getCiProvider() && !options.oidcProvider) {
    throw new Error(
      `No CI provider found: get-oidc-token runs in a CI job. To exchange a token you hold, use 'ci auth exchange --for ${credentialFor} --stdin'`
    );
  }
  const source = requireCiTokenSource(credentialFor, options);
  const audience = credentialSettings[credentialFor].getAudience(options);
  let token: string;
  try {
    token = await maskedSource(source).getToken(process.env, audience);
  } catch (e) {
    throw new Error(
      `Could not get the ${source.name}: ${(e as Error).message}`
    );
  }
  await writeStdout(`${token}\n`);
}

/** Only the token the job gives, from its variable or stdin. */
export async function exchangeHandler(
  credentialFor: CredentialFor,
  options: CiAuthOptions
) {
  const { tokenEnv } = credentialSettings[credentialFor];
  const envToken = process.env[tokenEnv]?.trim();
  if (envToken && options.stdin) {
    throw new Error(`${tokenEnv} and --stdin are both set: use one`);
  }
  const token = options.stdin ? await readStdin('OIDC token') : envToken;
  if (!token) {
    throw new Error(`No OIDC token: set ${tokenEnv} or pass --stdin`);
  }
  const name = options.stdin ? 'token from stdin' : `token in ${tokenEnv}`;
  await exchangeAndPrint(
    credentialFor,
    providedTokenSource(token, name),
    options
  );
}

/**
 * Revokes the credential from stdin, or the OIDC credentials in
 * CURRENTS_API_KEY and CURRENTS_RECORD_KEY. A key from the dashboard is not
 * revoked: the revoke endpoints answer 200 for it, but do nothing.
 */
export async function revokeHandler(options: CiAuthOptions) {
  const fromEnv = [sharedConfigKeys.apiKey.env, sharedConfigKeys.recordKey.env]
    .map((env) => ({ credential: process.env[env]?.trim(), from: env }))
    .filter(({ credential }) => credential);
  if (fromEnv.length > 0 && options.stdin) {
    throw new Error(
      `${fromEnv.map(({ from }) => from).join(' and ')} and --stdin are set: use one`
    );
  }
  const credentials = options.stdin
    ? [{ credential: await readStdin('credential'), from: 'stdin' }]
    : fromEnv;
  const revocable = credentials.flatMap(({ credential, from }) => {
    const kind = getCredentialKind(credential as string);
    if (kind) return [{ credential: credential as string, kind }];
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
  for (const { credential, kind } of revocable) {
    maskInGitHubLog(credential);
    await revokeOidcCredential(kind, credential);
    process.stderr.write(`Revoked the ${kind.name}\n`);
  }
}
