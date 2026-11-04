import { setTimeout as sleep } from 'node:timers/promises';
import _ from 'lodash';

import { debug as _debug } from '../debug';
import { reporterVersion } from '../env/versions';
import { maskKeys } from '../lib/credentials';
import { getAPIBaseUrl, getRestAPIBaseUrl, getTimeout } from './httpConfig';
import {
  getDelay,
  getMaxRetries,
  isRetriableError,
  isRetriableRestError,
  onRetry,
} from './httpRetry';
import {
  HttpError,
  HttpResponse,
  RequestBody,
  ResponseType,
  sendRequest,
} from './send';

const debug = _debug.extend('http');

export enum ClientType {
  API = 'api',
  REST_API = 'restApi',
}

export type QueryParams =
  | URLSearchParams
  | Record<string, string | number | boolean | null | undefined | string[]>;

export type RequestConfig = {
  method: string;
  /** Relative to the base URL of the client. */
  url: string;
  params?: QueryParams;
  /** A string or a Buffer is sent as it is, anything else as JSON. */
  data?: unknown;
  headers?: Record<string, string>;
  responseType?: ResponseType;
};

export type Client = {
  request<T = any>(config: RequestConfig): Promise<HttpResponse<T>>;
};

let _clients: Record<ClientType, Client | null> = {
  [ClientType.API]: null,
  [ClientType.REST_API]: null,
};

export function createClient(type: ClientType): Client {
  const baseURL =
    type === ClientType.API ? getAPIBaseUrl() : getRestAPIBaseUrl();
  debug('client base url: %s', baseURL);

  const retries = getMaxRetries();
  const retryCondition =
    type === ClientType.REST_API ? isRetriableRestError : isRetriableError;

  return {
    async request(config) {
      const headers: Record<string, string> = {
        'content-type': 'application/json',
        ..._.mapKeys(config.headers ?? {}, (_value, name) =>
          name.toLowerCase()
        ),
        'x-cmd-version': reporterVersion,
      };
      const body = toBody(config.data);
      const url = buildURL(baseURL, config.url, config.params);

      for (let retryCount = 0; ; retryCount++) {
        logRequest(baseURL, config, headers, retryCount > 0);
        try {
          return await sendRequest({
            method: config.method,
            url,
            headers,
            body,
            timeout: getTimeout(),
            responseType: config.responseType,
          });
        } catch (e) {
          // Messages for users name the path, not the full URL.
          if (e instanceof HttpError) e.config.url = config.url;
          if (!(retryCount < retries && retryCondition(e as Error))) throw e;
          onRetry(retryCount + 1, e as HttpError, config);
          await sleep(getDelay(retryCount + 1, e as HttpError));
        }
      }
    },
  };
}

export function getClient(type: ClientType): Client {
  if (_clients[type] === null) {
    _clients[type] = createClient(type);
  }

  return _clients[type] as Client;
}

function toBody(data: unknown): RequestBody | undefined {
  if (data === undefined) return undefined;
  if (typeof data === 'string' || Buffer.isBuffer(data)) return data;
  return JSON.stringify(data);
}

// How axios joined a base URL, a path and query parameters.
function buildURL(baseURL: string, path: string, params?: QueryParams) {
  const url = new URL(
    `${baseURL.replace(/\/?\/$/, '')}/${path.replace(/^\/+/, '')}`
  );
  const query =
    params instanceof URLSearchParams
      ? params.toString()
      : params
        ? serializeParams(params)
        : '';
  if (!query) return url.href;
  return `${url.origin}${url.pathname}${url.search}${url.search ? '&' : '?'}${query}`;
}

/**
 * `a=1&tag[]=x&tag[]=y` with the brackets encoded, without the parameters
 * that are undefined or null.
 */
function serializeParams(params: Exclude<QueryParams, URLSearchParams>) {
  const pairs: [string, string][] = [];
  for (const [name, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item !== undefined && item !== null) {
          pairs.push([`${name.trim()}[]`, String(item)]);
        }
      }
    } else {
      pairs.push([name.trim(), String(value)]);
    }
  }
  return pairs
    .map(([name, value]) => `${encode(name)}=${encode(value)}`)
    .join('&');
}

function encode(value: string) {
  return encodeURIComponent(value)
    .replace(/%3A/gi, ':')
    .replace(/%24/g, '$')
    .replace(/%2C/gi, ',')
    .replace(/%20/g, '+');
}

function logRequest(
  baseURL: string,
  config: RequestConfig,
  headers: Record<string, string>,
  isRetry: boolean
) {
  const data = {
    method: config.method.toLowerCase(),
    baseURL,
    url: config.url,
    headers,
    data: Buffer.isBuffer(config.data) ? 'buffer' : config.data,
    params: config.params,
    isRetry,
  };
  if (!isRetry) {
    debug('network request: %o', getNetworkRequestDebugData(data));
  } else {
    debug('network request retry: %o', getNetworkRequestDebugData(data));
  }
}

function getNetworkRequestDebugData(data: {
  headers: Record<string, string>;
  method?: string;
  url?: string;
  baseURL: string;
  data: unknown;
  params: unknown;
  isRetry?: boolean;
}) {
  return {
    method: data.method,
    baseURL: data.baseURL,
    url: data.url,
    data: data.isRetry ? '<retry>' : getPayloadDebugData(data.data),
    params: data.isRetry ? '<retry>' : data.params,
    headers: {
      ...data.headers,
      authorization: 'Bearer ***',
      'x-currents-key': '***',
    },
  };
}

function getPayloadDebugData(data: any) {
  if (data?.results?.raw) {
    return maskKeys({
      ...data,
      results: {
        ...data.results,
        raw: '***',
      },
    });
  }
  // Request bodies that carry a record key - cancel, cache - would otherwise
  // print it in full whenever debug is on. `currents api` sends JSON as text.
  if (typeof data === 'string') {
    try {
      return maskKeys(JSON.parse(data));
    } catch {
      return data;
    }
  }
  return _.isPlainObject(data) ? maskKeys(data) : data;
}
