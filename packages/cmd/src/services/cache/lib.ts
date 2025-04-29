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

export type RefMetaKeys = {
  cacheKey: string;
  metaCacheKey: string;
};

export type RefMetaFile = MetaFile & RefMetaKeys;

type CreateMetaParams = {
  config: CacheSetCommandConfig;
  cacheId: string;
  orgId: string;
  path: string[];
  ci: Record<string, unknown>;
  cacheKey?: string;
  metaCacheKey?: string;
};

export function createMeta({
  config,
  cacheId,
  orgId,
  path,
  ci,
  cacheKey,
  metaCacheKey,
}: CreateMetaParams) {
  const meta = {
    id: cacheId,
    orgId,
    config: omit(config, 'recordKey'),
    path,
    ci,
    createdAt: new Date().toISOString(),
    cacheKey,
    metaCacheKey,
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
