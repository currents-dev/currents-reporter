import { writeStdout } from '../../commands/utils';
import { sharedConfigKeys } from '../../config/keys';
import { getCiProvider } from '../../env/ciProvider';
import { DEFAULT_OIDC_AUDIENCE } from '../../http/httpConfig';
import { findTokenSource } from '../../lib/oidc';
import { credentialSettings, findCiTokenSource } from '.';

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
 * Says which credential each kind of request would use, without reading or
 * sending any token: no OIDC token request, exchange or check of a key.
 */
export async function statusHandler(
  options: StatusOptions,
  sources: StatusSources
) {
  const provider = getCiProvider();
  const apiKey = nameOf(
    options.apiKey,
    sources.apiKey,
    sharedConfigKeys.apiKey
  );
  const recordKey = nameOf(
    options.key,
    sources.key,
    sharedConfigKeys.recordKey
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

  const apiAudience = isSet(options.oidcApiAudience)
    ? `${credentialSettings.api.getAudience(options)} (${sources.oidcApiAudience === 'cli' ? '--oidc-api-audience' : 'CURRENTS_OIDC_API_AUDIENCE'})`
    : `${credentialSettings.api.getAudience(options)} (default)`;
  const recordAudience = isSet(options.oidcAudience)
    ? `${options.oidcAudience?.trim()} (${sources.oidcAudience === 'cli' ? '--oidc-audience' : 'CURRENTS_OIDC_AUDIENCE'})`
    : `${DEFAULT_OIDC_AUDIENCE} (default)`;

  const oidcNote = (oidc: string | undefined, key: string | undefined) =>
    oidc && !key && !project
      ? ['  The exchange needs --project-id or CURRENTS_PROJECT_ID']
      : [];

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
    `  Credential: ${recordKey ?? apiKey ?? (recordOidc ? `OIDC, ${recordOidc}` : 'none')}`,
    `  OIDC audience: ${recordAudience}`,
    ...oidcNote(recordOidc, recordKey ?? apiKey),
    '',
    'Environment:',
    ...STATUS_ENV_INPUTS.map((name) => `  ${name}: ${envInputState(name)}`),
  ];
  await writeStdout(`${lines.join('\n')}\n`);
}
