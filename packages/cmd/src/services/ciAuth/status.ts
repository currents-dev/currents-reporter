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
  findTokenSource,
  recordingKeyOption,
  recordsWithApiKey,
  recordsWithOidc,
} from '../../lib/oidc';
import { findCiTokenSource } from '.';

/** Where commander took an option from: 'cli', 'env', or undefined for none. */
type OptionSource = string | undefined;

export type StatusOptions = {
  apiKey?: string;
  key?: string;
  projectId?: string;
  oidcApiAudience?: string;
  oidcAudience?: string;
};

export type StatusSources = Partial<Record<keyof StatusOptions, OptionSource>>;

const STATUS_ENV_INPUTS = [
  sharedConfigKeys.apiKey.env,
  sharedConfigKeys.recordKey.env,
  'CURRENTS_OIDC_API_TOKEN',
  'CURRENTS_OIDC_TOKEN',
  'ACTIONS_ID_TOKEN_REQUEST_URL',
  'ACTIONS_ID_TOKEN_REQUEST_TOKEN',
  sharedConfigKeys.projectId.env,
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
 * The audience as getOidcAudience and getOidcApiAudience resolve it, and where
 * it came from: a blank flag or variable is skipped.
 */
function describeAudience(
  option: string | undefined,
  source: OptionSource,
  { flag, env, fallback }: { flag: string; env: string; fallback: string }
) {
  if (source === 'cli' && isSet(option)) return `${option?.trim()} (${flag})`;
  if (isEnvSet(env)) return `${process.env[env]?.trim()} (${env})`;
  return `${fallback} (default)`;
}

/** The visible commands of the program that record, by full name, such as "run upload". */
function recordingCommands(program: CommandUnknownOpts) {
  const help = program.createHelp();
  const walk = (
    command: CommandUnknownOpts,
    prefix: string[]
  ): { name: string; withApiKey: boolean }[] =>
    help.visibleCommands(command).flatMap((sub) => {
      const path = [...prefix, sub.name()];
      return [
        ...(recordsWithOidc(sub)
          ? [{ name: path.join(' '), withApiKey: recordsWithApiKey(sub) }]
          : []),
        ...walk(sub, path),
      ];
    });
  return walk(program, []);
}

/**
 * Says which credential each kind of request would use, without reading or
 * sending any token: no OIDC token request, exchange or check of a key.
 */
export async function statusHandler(
  options: StatusOptions,
  sources: StatusSources,
  program: CommandUnknownOpts
) {
  // A blank flag would hide the variable and make OIDC look like the source.
  for (const [name, flag] of [
    ['apiKey', '--api-key'],
    ['key', '--key'],
  ] as const) {
    if (sources[name] === 'cli' && !isSet(options[name])) {
      throw new Error(`${flag} is empty: pass a key or leave the flag out`);
    }
  }
  const provider = getCiProvider();
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
  const apiOidc = findCiTokenSource('api');
  // The recording commands find their token as useOidcRecordKey does.
  const recordOidc = isEnvSet('CURRENTS_OIDC_TOKEN')
    ? 'token in CURRENTS_OIDC_TOKEN'
    : findTokenSource()?.name;

  const apiAudience = describeAudience(
    options.oidcApiAudience,
    sources.oidcApiAudience,
    {
      flag: '--oidc-api-audience',
      env: OIDC_API_AUDIENCE_ENV,
      fallback: DEFAULT_OIDC_API_AUDIENCE,
    }
  );
  const recordAudience = describeAudience(
    options.oidcAudience,
    sources.oidcAudience,
    {
      flag: '--oidc-audience',
      env: 'CURRENTS_OIDC_AUDIENCE',
      fallback: DEFAULT_OIDC_AUDIENCE,
    }
  );

  const oidcNote = (oidc: string | undefined, key: string | undefined) =>
    oidc && !key && !project
      ? ['  The exchange needs --project-id or CURRENTS_PROJECT_ID']
      : [];

  // Same choice as useOidcRecordKey: a key, else an OIDC token.
  const recordingKeyName = (withApiKey: boolean) => {
    const option = recordingKeyOption(withApiKey, options);
    if (!option) return undefined;
    const { cli, env } =
      option === 'key' ? sharedConfigKeys.recordKey : sharedConfigKeys.apiKey;
    return sources[option] === 'cli' ? cli : env;
  };
  const recordingKeys = new Map<string | undefined, string[]>();
  for (const { name, withApiKey } of recordingCommands(program)) {
    const key = recordingKeyName(withApiKey);
    recordingKeys.set(key, [...(recordingKeys.get(key) ?? []), name]);
  }
  const recordingCredential = (key: string | undefined) =>
    key ?? (recordOidc ? `OIDC, ${recordOidc}` : 'none');
  const recordingCredentialLines =
    recordingKeys.size === 1
      ? [`  Credential: ${recordingCredential([...recordingKeys.keys()][0])}`]
      : [...recordingKeys].map(
          ([key, names]) =>
            `  Credential: ${recordingCredential(key)} (${names.join(', ')})`
        );

  const lines = [
    `CI provider: ${provider ?? 'none'}`,
    `Project: ${project ? `${options.projectId?.trim()} (${project})` : 'not set'}`,
    ...(provider === 'githubActions' &&
    !(
      isEnvSet('ACTIONS_ID_TOKEN_REQUEST_URL') &&
      isEnvSet('ACTIONS_ID_TOKEN_REQUEST_TOKEN')
    )
      ? [
          'GitHub Actions OIDC: not available; the job needs `permissions: id-token: write`',
        ]
      : []),
    '',
    'API requests:',
    `  Credential: ${apiKey ?? (apiOidc ? `OIDC, ${apiOidc.name}` : 'none')}`,
    `  OIDC audience: ${apiAudience}`,
    ...oidcNote(apiOidc?.name, apiKey),
    '',
    'Recording:',
    ...recordingCredentialLines,
    `  OIDC audience: ${recordAudience}`,
    // Commands without a key exchange the OIDC token.
    ...(recordingKeys.has(undefined) ? oidcNote(recordOidc, undefined) : []),
    '',
    'Environment:',
    ...STATUS_ENV_INPUTS.map((name) => `  ${name}: ${envInputState(name)}`),
  ];
  await writeStdout(`${lines.join('\n')}\n`);
}
