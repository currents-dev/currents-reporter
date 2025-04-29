import { debug as _debug } from '../debug';
import { makeRequest } from '../http';
import { ClientType } from '../http/client';
import { maskRecordKey } from '../lib';

const debug = _debug.extend('api');

export type CacheRequestConfigParams = {
  matrixIndex?: number;
  matrixTotal?: number;
};

export type CacheRequestParams = {
  recordKey: string;
  ci: Record<string, unknown>;
  id?: string;
  config?: CacheRequestConfigParams;
};

export type CacheRetrievalParams = {
  recordKey: string;
  cacheKey: string;
  metaCacheKey?: string;
};

export type CacheCreationResponse = {
  cacheId: string;
  orgId: string;
  uploadUrl: string;
  metaUploadUrl: string;
  cacheKey: string;
  metaCacheKey: string;
  refMetaUploadUrl: string;
};

export type CacheMetaResponse = {
  cacheId: string;
  orgId: string;
  refMetaReadUrl: string;
};

export type CacheRetrievalResponse = {
  orgId: string;
  readUrl: string;
  metaReadUrl?: string;
};

export async function createCache(params: CacheRequestParams) {
  try {
    debug('Request params: %o', maskRecordKey(params));

    return makeRequest<CacheCreationResponse, CacheRequestParams>(
      ClientType.API,
      {
        url: 'cache/upload',
        method: 'POST',
        data: params,
      }
    ).then((res) => res.data);
  } catch (err) {
    debug('Failed to create cache:', err);
    throw err;
  }
}

export async function retrieveCache(params: CacheRetrievalParams) {
  try {
    debug('Request params: %o', params);

    return makeRequest<CacheRetrievalResponse, CacheRetrievalParams>(
      ClientType.API,
      {
        url: 'cache/v2/download',
        method: 'POST',
        data: params,
      }
    ).then((res) => res.data);
  } catch (err) {
    debug('Failed to retrieve cache:', err);
    throw err;
  }
}

export async function getRefCacheMeta(params: CacheRequestParams) {
  try {
    debug('Request params: %o', params);

    return makeRequest<CacheMetaResponse, CacheRequestParams>(ClientType.API, {
      url: 'cache/meta',
      method: 'POST',
      data: params,
    }).then((res) => res.data);
  } catch (err) {
    debug('Failed to retrieve reference cache meta:', err);
    throw err;
  }
}
