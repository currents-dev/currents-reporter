import { getOidcAudience } from '../http/httpConfig';

/** The options that several commands share, with their environment variables. */
export const sharedConfigKeys = {
  apiKey: {
    name: 'API key',
    env: 'CURRENTS_API_KEY',
    cli: '--api-key',
  },
  recordKey: {
    name: 'Record key',
    env: 'CURRENTS_RECORD_KEY',
    cli: '--key',
  },
  projectId: {
    name: 'Project ID',
    env: 'CURRENTS_PROJECT_ID',
    cli: '--project-id',
  },
  ciBuildId: {
    name: 'CI build ID',
    env: 'CURRENTS_CI_BUILD_ID',
    cli: '--ci-build-id',
  },
  machineId: {
    name: 'Machine ID',
    env: 'CURRENTS_MACHINE_ID',
    cli: '--machine-id',
  },
  tag: {
    name: 'Tag',
    cli: '--tag',
  },
  debug: {
    name: 'Debug',
    env: 'CURRENTS_DEBUG',
    cli: '--debug',
  },
} as const;

/** Added to the error for a missing record key. */
export const getOidcHint = () => {
  const audience = getOidcAudience();
  return `Without a stored record key, a CI job can use its OIDC token: set \`permissions: id-token: write\` on GitHub Actions, pass --oidc-provider google on Google Cloud, or on any other CI put a token in --oidc-token or CURRENTS_OIDC_TOKEN with ${audience} as its audience (for GitLab \`id_tokens\`: \`aud: ${audience}\`). Staging and on-prem installs use their own audience: set CURRENTS_OIDC_AUDIENCE to its value. https://docs.currents.dev`;
};
