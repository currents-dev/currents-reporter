import { debug as _debug } from "../debug";
import { makeRequest } from "../http";
import { ClientType } from "../http/client";

const debug = _debug.extend("api");

export type CacheRequestParams = {
  recordKey: string;
  ci: Record<string, unknown>;
  id?: string;
};

export type CacheCreationResponse = {
  cacheId: string;
  orgId: string;
  uploadUrl: string;
  metaUploadUrl: string;
};

export type CacheRetrievalResponse = {
  cacheId: string;
  orgId: string;
  readUrl: string;
  metaReadUrl: string;
};

export async function createCache(params: CacheRequestParams) {
  try {
    debug("Request params: %o", params);

    return makeRequest<CacheCreationResponse, CacheRequestParams>(
      ClientType.API,
      {
        url: "cache/upload",
        method: "POST",
        data: params,
      }
    ).then((res) => res.data);
  } catch (err) {
    debug("Failed to create cache:", err);
    throw err;
  }
}

export async function retrieveCache(params: CacheRequestParams) {
  try {
    debug("Request params: %o", params);

    return makeRequest<CacheRetrievalResponse, CacheRequestParams>(
      ClientType.API,
      {
        url: "cache/download",
        method: "POST",
        data: params,
      }
    ).then((res) => res.data);
  } catch (err) {
    debug("Failed to retrieve cache:", err);
    throw err;
  }
}
