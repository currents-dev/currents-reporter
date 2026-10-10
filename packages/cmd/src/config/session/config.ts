import { debug as _debug } from '@debug';
import { maskKeys, ValidationError } from '@lib';
import { getValidatedConfig } from '../utils';
import { configKeys } from './env';

const debug = _debug.extend('config');

/** A record key, sent when set, or an API key with write access. */
type Credentials = {
  apiKey?: string;
  recordKey?: string;
};

export type SessionStartConfig = Credentials & {
  projectId: string;
  title: string;
  status: 'passed' | 'failed';
  error?: string;
  tag?: string[];
  pr?: string;
  json?: boolean;
  debug?: boolean;
};

/**
 * Where attached files go. Without a run ID the session saved by
 * `session start` is used.
 */
export type SessionAttachConfig = Credentials & {
  sessionId?: string;
  type?: string;
  caption?: string;
  meta?: string[];
  debug?: boolean;
};

export type SessionShareConfig = Credentials & {
  sessionId?: string;
  expiresInDays?: number;
  debug?: boolean;
};

export type RunAttachConfig = Credentials & {
  projectId: string;
  /** Without it the CI environment tells the API which run this is. */
  ciBuildId?: string;
  machineId?: string;
  spec?: string;
  testTitle?: string;
  group?: string;
  attempt?: number;
  type?: string;
  caption?: string;
  meta?: string[];
  debug?: boolean;
};

export function getSessionStartConfig(options?: Partial<SessionStartConfig>) {
  const config = getValidatedConfig<typeof configKeys, SessionStartConfig>(
    configKeys,
    ['projectId', 'title'],
    options,
    requireCredentials
  );
  debug('Resolved config: %o', maskKeys(config));
  return config;
}

export function getSessionAttachConfig(options?: Partial<SessionAttachConfig>) {
  const config = getValidatedConfig<typeof configKeys, SessionAttachConfig>(
    configKeys,
    [],
    options,
    requireCredentials
  );
  debug('Resolved config: %o', maskKeys(config));
  return config;
}

export function getSessionShareConfig(options?: Partial<SessionShareConfig>) {
  const config = getValidatedConfig<typeof configKeys, SessionShareConfig>(
    configKeys,
    [],
    options,
    requireCredentials
  );
  debug('Resolved config: %o', maskKeys(config));
  return config;
}

export function getRunAttachConfig(options?: Partial<RunAttachConfig>) {
  const config = getValidatedConfig<typeof configKeys, RunAttachConfig>(
    configKeys,
    ['projectId'],
    options,
    requireCredentials
  );
  debug('Resolved config: %o', maskKeys(config));
  return config;
}

function requireCredentials(config: Credentials) {
  if (config.recordKey || config.apiKey) return;
  throw new ValidationError(
    `${configKeys.recordKey.name} or ${configKeys.apiKey.name} is required. Set ${configKeys.recordKey.env} or ${configKeys.apiKey.env}, or pass ${configKeys.recordKey.cli} or ${configKeys.apiKey.cli}`
  );
}
