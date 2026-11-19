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
  oidcPolicyId: {
    name: 'OIDC policy ID',
    env: 'CURRENTS_OIDC_POLICY_ID',
    cli: '--oidc-policy-id',
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

/** Added to the error for a missing key: how a CI job gets one without a stored secret. */
export const ciAuthHints = {
  recordKey: `in CI, run \`currents ci auth get-record-key\` and set ${sharedConfigKeys.recordKey.env} to its output`,
  apiKey: `in CI, run \`currents ci auth get-api-token\` and set ${sharedConfigKeys.apiKey.env} to its output`,
};
