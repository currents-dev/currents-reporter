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

export type CacheReadUrlsRequestParams = {
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

export type CacheRetrievalResponse = {
  cacheId: string;
  orgId: string;
  refMetaReadUrl: string;
};

export type CacheReadUrlsResponse = {
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

export async function retrieveCache(params: CacheRequestParams) {
  try {
    debug('Request params: %o', params);

    return makeRequest<CacheRetrievalResponse, CacheRequestParams>(
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

export async function retrieveCacheReadUrls(
  params: CacheReadUrlsRequestParams
) {
  try {
    debug('Request params: %o', params);

    return makeRequest<CacheReadUrlsResponse, CacheReadUrlsRequestParams>(
      ClientType.API,
      {
        url: 'cache/meta',
        method: 'POST',
        data: params,
      }
    ).then((res) => res.data);
  } catch (err) {
    debug('Failed to retrieve cache read URLs:', err);
    throw err;
  }
}
