import { sharedConfigKeys } from '../keys';

const { recordKey, projectId, ciBuildId, debug } = sharedConfigKeys;

export const configKeys = {
  recordKey,
  projectId,
  ciBuildId,
  runId: {
    name: 'Run ID',
    env: 'CURRENTS_RUN_ID',
    cli: '--run-id',
  },
  debug,
} as const;
