import { CommandUnknownOpts } from '@commander-js/extra-typings';
import { writeStdout } from '../../commands/utils';
import { sharedConfigKeys } from '../../config/keys';
import { getCiProvider } from '../../env/ciProvider';
import {
  DEFAULT_OIDC_API_AUDIENCE,
  DEFAULT_OIDC_AUDIENCE,
  OIDC_API_AUDIENCE_ENV,
} from '../../http/httpConfig';
import {
  getGoogleMetadataHost,
  GoogleMetadataError,
  OIDC_PROVIDER_ENV,
  OidcProvider,
  requestGoogleMetadata,
} from '../../lib/oidc';
import { OIDC_TOKEN_ENV } from '.';

/** Where commander took an option from: 'cli', 'env', or undefined for none. */
type OptionSource = string | undefined;

export type StatusOptions = {
  apiKey?: string;
  key?: string;
  projectId?: string;
  oidcPolicyId?: string;
  oidcProvider?: OidcProvider;
};

export type StatusSources = Partial<Record<keyof StatusOptions, OptionSource>>;

const STATUS_ENV_INPUTS = [
  sharedConfigKeys.apiKey.env,
  sharedConfigKeys.recordKey.env,
  OIDC_TOKEN_ENV,
  'ACTIONS_ID_TOKEN_REQUEST_URL',
  'ACTIONS_ID_TOKEN_REQUEST_TOKEN',
  OIDC_PROVIDER_ENV,
  'GCE_METADATA_HOST',
  sharedConfigKeys.projectId.env,
  sharedConfigKeys.oidcPolicyId.env,
  'CURRENTS_OIDC_API_AUDIENCE',
  'CURRENTS_OIDC_AUDIENCE',
];

const isSet = (value?: string) => Boolean(value?.trim());
const isEnvSet = (name: string) => isSet(process.env[name]);

/** The flag or variable a value came from, by name. Blank values do not count. */
function nameOf(
  value: string | undefined,
  source: OptionSource,
  { cli, env }: { cli: string; env: string }
) {
  if (!isSet(value)) return undefined;
  return source === 'cli' ? cli : env;
}

const envInputState = (name: string) => {
  const value = process.env[name];
  if (value === undefined) return 'not set';
  return isSet(value) ? 'set' : 'set (empty)';
};

/**
 * The default audience of the 'ci auth' commands, as getOidcAudience and
 * getOidcApiAudience resolve it, and where it came from.
 */
const describeAudience = (env: string, fallback: string) =>
  isEnvSet(env)
    ? `${process.env[env]?.trim()} (${env})`
    : `${fallback} (default)`;

const SERVICE_ACCOUNT_EMAIL = /^[A-Za-z0-9._-]{1,100}@[A-Za-z0-9.-]{1,200}$/;

/**
 * Asks for the email of the service account, not for a token: the answer says
 * whether the metadata server answers and has a service account for the CLI.
 * No other text of the answer is printed.
 */
async function describeGoogleMetadataServer() {
  let host: string;
  try {
    host = getGoogleMetadataHost();
  } catch (e) {
    return `Google Cloud OIDC: ${(e as Error).message}`;
  }
  try {
    const email = await requestGoogleMetadata(
      'instance/service-accounts/default/email'
    );
    const account = SERVICE_ACCOUNT_EMAIL.test(email) ? email : 'not named';
    return `Google Cloud OIDC: the metadata server at ${host} answers; service account ${account}`;
  } catch (e) {
    if (e instanceof GoogleMetadataError && e.status !== undefined) {
      return `Google Cloud OIDC: the metadata server at ${host} answered ${e.status} for the service account email`;
    }
    return `Google Cloud OIDC: ${(e as Error).message}`;
  }
}

const hasOption = (command: CommandUnknownOpts, long: string) =>
  command.options.some((o) => o.long === long);

const rootOf = (command: CommandUnknownOpts): CommandUnknownOpts =>
  command.parent ? rootOf(command.parent) : command;

/**
 * The visible commands with `--key`, by full name, such as "run upload".
 * The status command has `--key` only to report it.
 */
function recordingCommands(statusCommand: CommandUnknownOpts) {
  const program = rootOf(statusCommand);
  const help = program.createHelp();
  const walk = (
    command: CommandUnknownOpts,
    prefix: string[]
  ): { name: string; withApiKey: boolean }[] =>
    help.visibleCommands(command).flatMap((sub) => {
      const path = [...prefix, sub.name()];
      return [
        ...(sub !== statusCommand && hasOption(sub, '--key')
          ? [{ name: path.join(' '), withApiKey: hasOption(sub, '--api-key') }]
          : []),
        ...walk(sub, path),
      ];
    });
  return walk(program, []);
}

/**
 * The option that holds the key of a recording command: the record key, or
 * the API key of a command with `--api-key`. Any value but an empty string
 * counts, also whitespace: getAuthHeaders sends it.
 */
function recordingKeyOption(
  withApiKey: boolean,
  { key, apiKey }: StatusOptions
): 'key' | 'apiKey' | undefined {
  if (key) return 'key';
  if (withApiKey && apiKey) return 'apiKey';
  return undefined;
}

/**
 * Says which key each kind of request would use, without reading or sending
 * any token: no OIDC token request, exchange or check of a key.
 */
export async function statusHandler(
  options: StatusOptions,
  sources: StatusSources,
  statusCommand: CommandUnknownOpts
) {
  // A blank flag would hide the variable.
  for (const [name, flag] of [
    ['apiKey', '--api-key'],
    ['key', '--key'],
  ] as const) {
    if (sources[name] === 'cli' && !isSet(options[name])) {
      throw new Error(`${flag} is empty: pass a key or leave the flag out`);
    }
  }
  const ciProvider = getCiProvider();
  const apiKey = nameOf(
    options.apiKey,
    sources.apiKey,
    sharedConfigKeys.apiKey
  );
  const project = nameOf(
    options.projectId,
    sources.projectId,
    sharedConfigKeys.projectId
  );
  const policy = nameOf(
    options.oidcPolicyId,
    sources.oidcPolicyId,
    sharedConfigKeys.oidcPolicyId
  );
  const provider = options.oidcProvider;
  const providerName =
    provider &&
    (sources.oidcProvider === 'cli' ? '--oidc-provider' : OIDC_PROVIDER_ENV);
  const recordingKeyName = (withApiKey: boolean) => {
    const option = recordingKeyOption(withApiKey, options);
    if (!option) return undefined;
    const { cli, env } =
      option === 'key' ? sharedConfigKeys.recordKey : sharedConfigKeys.apiKey;
    return sources[option] === 'cli' ? cli : env;
  };
  const recordingKeys = new Map<string | undefined, string[]>();
  for (const { name, withApiKey } of recordingCommands(statusCommand)) {
    const key = recordingKeyName(withApiKey);
    recordingKeys.set(key, [...(recordingKeys.get(key) ?? []), name]);
  }
  const recordingCredentialLines =
    recordingKeys.size === 1
      ? [`  Credential: ${[...recordingKeys.keys()][0] ?? 'none'}`]
      : [...recordingKeys].map(
          ([key, names]) =>
            `  Credential: ${key ?? 'none'} (${names.join(', ')})`
        );

  const lines = [
    `CI provider: ${ciProvider ?? 'none'}`,
    `Project: ${project ? `${options.projectId?.trim()} (${project})` : 'not set'}`,
    `OIDC provider: ${provider ? `${provider} (${providerName})` : 'not set'}`,
    ...((ciProvider === 'githubActions' || provider === 'github-actions') &&
    !(
      isEnvSet('ACTIONS_ID_TOKEN_REQUEST_URL') &&
      isEnvSet('ACTIONS_ID_TOKEN_REQUEST_TOKEN')
    )
      ? [
          'GitHub Actions OIDC: not available; the job needs `permissions: id-token: write`',
        ]
      : []),
    ...(provider === 'google-cloud'
      ? [await describeGoogleMetadataServer()]
      : []),
    '',
    `ci auth exchange: the token from --stdin, or else ${OIDC_TOKEN_ENV} (${envInputState(OIDC_TOKEN_ENV)}); its audience or --for picks the credential`,
    `OIDC policy: ${policy ? `${options.oidcPolicyId?.trim()} (${policy})` : 'not set'}`,
    '',
    'API requests:',
    `  Credential: ${apiKey ?? 'none'}`,
    `  OIDC audience: ${describeAudience(OIDC_API_AUDIENCE_ENV, DEFAULT_OIDC_API_AUDIENCE)}`,
    '',
    'Recording:',
    ...recordingCredentialLines,
    `  OIDC audience: ${describeAudience('CURRENTS_OIDC_AUDIENCE', DEFAULT_OIDC_AUDIENCE)}`,
    '',
    'Environment:',
    ...STATUS_ENV_INPUTS.map((name) => `  ${name}: ${envInputState(name)}`),
  ];
  await writeStdout(`${lines.join('\n')}\n`);
}
