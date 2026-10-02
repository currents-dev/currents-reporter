export const configKeys = {
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
  runId: {
    name: 'Run ID',
    env: 'CURRENTS_RUN_ID',
    cli: '--run-id',
  },
  debug: {
    name: 'Debug',
    env: 'CURRENTS_DEBUG',
    cli: '--debug',
  },
} as const;
