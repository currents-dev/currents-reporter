import { omit } from 'lodash';
import { CacheSetCommandConfig } from '../../config/cache';
import { warnWithNoTrace } from '../../logger';

export type MetaFile = {
  id: string;
  orgId: string;
  config: CacheSetCommandConfig;
  path: string[];
  ci: Record<string, unknown>;
  createdAt: string;
};

export function createMeta({
  config,
  cacheId,
  orgId,
  path,
  ci,
}: {
  config: CacheSetCommandConfig;
  cacheId: string;
  orgId: string;
  path: string[];
  ci: Record<string, unknown>;
}) {
  const meta = {
    id: cacheId,
    orgId,
    config: omit(config, 'recordKey'),
    path,
    ci,
    createdAt: new Date().toISOString(),
  };

  return Buffer.from(JSON.stringify(meta));
}

export function warn(error: unknown, msg: string) {
  if (error instanceof Error) {
    warnWithNoTrace('%s. %s.', msg, error.message);
  } else {
    warnWithNoTrace('%s. %s.', msg, 'Unknown error');
  }
}
