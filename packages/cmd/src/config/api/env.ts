import { sharedConfigKeys } from '../keys';

const { apiKey, debug, ciBuildId, projectId, tag } = sharedConfigKeys;

export const configKeys = {
  apiKey,
  debug,
  ciBuildId,
  projectId,
  tag,
  branch: {
    name: 'Branch',
    cli: '--branch',
  },
  output: {
    name: 'Output file',
    env: 'CURRENTS_OUTPUT',
    cli: '--output',
  },
} as const;
