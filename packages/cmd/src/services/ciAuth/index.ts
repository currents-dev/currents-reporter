import { sharedConfigKeys } from '../../config/keys';
import {
  DEFAULT_OIDC_API_AUDIENCE,
  DEFAULT_OIDC_AUDIENCE,
  getOidcApiAudience,
  getOidcAudience,
} from '../../http/httpConfig';
import { writeStdout } from '../../commands/utils';
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
} from '../../lib/oidc';

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
  oidcProvider?: OidcProvider;
  audience?: string;
  json?: boolean;
  stdin?: boolean;
  debug?: boolean;
};

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
