import { sharedConfigKeys } from '../keys';

const { debug, ciBuildId, recordKey, projectId, machineId } = sharedConfigKeys;

export const configKeys = {
  debug,
  ciBuildId,
  recordKey,
  projectId,
  machineId,
  tag: {
    ...sharedConfigKeys.tag,
    env: 'CURRENTS_TAG',
  },
  disableTitleTags: {
    name: 'Disable title tags',
    env: 'CURRENTS_DISABLE_TITLE_TAGS',
    cli: '--disable-title-tags',
  },
  removeTitleTags: {
    name: 'Remove title tags',
    env: 'CURRENTS_REMOVE_TITLE_TAGS',
    cli: '--remove-title-tags',
  },
  reportDir: {
    name: 'Report folder',
    env: 'CURRENTS_REPORT_DIR',
    cli: '--report-dir',
  },
} as const;
