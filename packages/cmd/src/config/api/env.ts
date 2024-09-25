import { APICommandConfig } from './config';

const apiCommandConfigKeys = {
  apiKey: {
    name: 'Api Key',
    env: 'CURRENTS_API_KEY',
    cli: '--api-key',
  },
  debug: {
    name: 'Debug',
    env: 'CURRENTS_DEBUG',
    cli: '--debug',
  },
} as const;

const apiGetRunCommandConfigKeys = {
  branch: {
    name: 'Run Branch',
    cli: '--branch',
  },
  output: {
    name: 'Output Path',
    env: 'CURRENTS_OUTPUT',
    cli: '--output',
  },
  ciBuildId: {
    name: 'CI Build ID',
    cli: '--ci-build-id',
  },
  projectId: {
    name: 'Project ID',
    env: 'CURRENTS_PROJECT_ID',
    cli: '--project-id',
  },
  tag: {
    name: 'Run Tag',
    cli: '--tag',
  },
} as const;

export const configKeys = {
  ...apiCommandConfigKeys,
  ...apiGetRunCommandConfigKeys,
} as const;

export function getEnvVariables(): Partial<
  Record<
    keyof APICommandConfig,
    string | string[] | boolean | number | undefined
  >
> {
  return {
    apiKey: process.env[configKeys.apiKey.env],
    debug: !!process.env[configKeys.debug.env],
  };
}
