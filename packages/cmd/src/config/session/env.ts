export const configKeys = {
  apiKey: {
    name: 'Api Key',
    env: 'CURRENTS_API_KEY',
    cli: '--api-key',
  },
  recordKey: {
    name: 'Record Key',
    env: 'CURRENTS_RECORD_KEY',
    cli: '--key',
  },
  projectId: {
    name: 'Project ID',
    env: 'CURRENTS_PROJECT_ID',
    cli: '--project-id',
  },
  ciBuildId: {
    name: 'CI Build ID',
    env: 'CURRENTS_CI_BUILD_ID',
    cli: '--ci-build-id',
  },
  machineId: {
    name: 'Machine ID',
    env: 'CURRENTS_MACHINE_ID',
    cli: '--machine-id',
  },
  sessionId: {
    name: 'Session ID',
    env: 'CURRENTS_SESSION_ID',
    cli: '--session-id',
  },
  title: {
    name: 'Title',
    cli: '--title',
  },
  debug: {
    name: 'Debug',
    env: 'CURRENTS_DEBUG',
    cli: '--debug',
  },
} as const;

/**
 * Commander applies the environment variables when it parses the options, so
 * the command line wins over the environment. Nothing is read again here.
 */
export const getEnvVariables = () => ({});
