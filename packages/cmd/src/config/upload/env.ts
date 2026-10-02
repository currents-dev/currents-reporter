export const configKeys = {
  debug: {
    name: 'Debug',
    env: 'CURRENTS_DEBUG',
    cli: '--debug',
  },
  ciBuildId: {
    name: 'CI Build ID',
    env: 'CURRENTS_CI_BUILD_ID',
    cli: '--ci-build-id',
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
  tag: {
    name: 'Currents Tag',
    env: 'CURRENTS_TAG',
    cli: '--tag',
  },
  disableTitleTags: {
    name: 'Disable Title Tags',
    env: 'CURRENTS_DISABLE_TITLE_TAGS',
    cli: '--disable-title-tags',
  },
  removeTitleTags: {
    name: 'Remove Title Tags',
    env: 'CURRENTS_REMOVE_TITLE_TAGS',
    cli: '--remove-title-tags',
  },
  machineId: {
    name: 'Machine ID',
    env: 'CURRENTS_MACHINE_ID',
    cli: '--machine-id',
  },
  reportDir: {
    name: 'Report Directory',
    env: 'CURRENTS_REPORT_DIR',
    cli: '--report-dir',
  },
} as const;
