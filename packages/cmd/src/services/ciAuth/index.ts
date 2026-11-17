import { sharedConfigKeys } from '../../config/keys';
import {
  DEFAULT_OIDC_API_AUDIENCE,
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
  providedTokenSource,
  RECORD_KEY_KIND,
  revokeOidcCredential,
  TokenSource,
} from '../../lib/oidc';

export type CredentialFor = 'api' | 'record';

type CredentialSettings = {
  kind: OidcCredentialKind;
  /** The variable a job puts its OIDC token in, on any CI provider. */
  tokenEnv: string;
  getAudience: (options: CiAuthOptions) => string;
};

const credentialSettings: Record<CredentialFor, CredentialSettings> = {
  api: {
    kind: API_TOKEN_KIND,
    tokenEnv: 'CURRENTS_OIDC_API_TOKEN',
    getAudience: (options) =>
      options.oidcApiAudience?.trim() || DEFAULT_OIDC_API_AUDIENCE,
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

/** The OIDC token in the variable of the kind, or GitHub Actions. */
export async function getCredentialHandler(
  credentialFor: CredentialFor,
  options: CiAuthOptions
) {
  const { kind, tokenEnv, getAudience } = credentialSettings[credentialFor];
  const token = process.env[tokenEnv]?.trim();
  const source = token
    ? providedTokenSource(token, `token in ${tokenEnv}`)
    : findTokenSource();
  if (!source) {
    throw new Error(
      `No OIDC token to get a ${kind.name} from: set \`permissions: id-token: write\` on GitHub Actions, or on any other CI put a token with the audience ${getAudience(options)} in ${tokenEnv}`
    );
  }
  await exchangeAndPrint(credentialFor, source, options);
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
      `No OIDC credential to revoke: pass one on stdin with --stdin, or set ${sharedConfigKeys.apiKey.env} or ${sharedConfigKeys.recordKey.env}`
    );
  }
  for (const { credential, kind } of revocable) {
    maskInGitHubLog(credential);
    await revokeOidcCredential(kind, credential);
    process.stderr.write(`Revoked the ${kind.name}\n`);
  }
}
