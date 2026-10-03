import { sharedConfigKeys } from '../keys';

const { apiKey, recordKey, projectId, ciBuildId, machineId, debug } =
  sharedConfigKeys;

export const configKeys = {
  apiKey,
  recordKey,
  projectId,
  ciBuildId,
  machineId,
  sessionId: {
    name: 'Session ID',
    env: 'CURRENTS_SESSION_ID',
    cli: '--session-id',
  },
  title: {
    name: 'Title',
    cli: '--title',
  },
  debug,
} as const;
