import axios, { AxiosInstance } from 'axios';
import axiosRetry from 'axios-retry';
import _ from 'lodash';

import { debug as _debug } from '../debug';
import { reporterVersion } from '../env/versions';
import { getAPIBaseUrl, getRestAPIBaseUrl, getTimeout } from './httpConfig';
import {
  getDelay,
  getMaxRetries,
  isRetriableError,
  onRetry,
} from './httpRetry';

const debug = _debug.extend('http');

export enum ClientType {
  API = 'api',
  REST_API = 'restApi',
}

let _clients: Record<ClientType, AxiosInstance | null> = {
  [ClientType.API]: null,
  [ClientType.REST_API]: null,
};

export function createClient(type: ClientType) {
  const baseURL =
    type === ClientType.API ? getAPIBaseUrl() : getRestAPIBaseUrl();
  debug('client base url: %s', baseURL);

  const client = axios.create({
    baseURL,
    // Setting no timeout means axios will wait forever for a response
    // and the actual timeout will be handled by the underlying network
    // stack
    timeout: getTimeout(),
    transitional: {
      // throw ETIMEDOUT error instead of generic ECONNABORTED on request timeouts
      clarifyTimeoutError: true,
    },
  });

  client.interceptors.request.use((config) => {
    // @ts-ignore
    const retry = config['axios-retry']?.retryCount ?? 0;

    config.headers.set({
      'x-cmd-version': reporterVersion,
    });

    if (!config.headers.get('Content-Type')) {
      config.headers.set('Content-Type', 'application/json');
    }

    const args = {
      ..._.pick(config, 'method', 'url', 'headers'),
      baseURL,
      data: Buffer.isBuffer(config.data) ? 'buffer' : (config.data as unknown),
      params: config.params,
    };

    if (!retry) {
      debug('network request: %o', getNetworkRequestDebugData(args));
    } else {
      debug(
        'network request retry: %o',
        getNetworkRequestDebugData({
          ...args,
          baseURL,
          isRetry: true,
        })
      );
    }
    return config;
  });

  axiosRetry(client, {
    retries: getMaxRetries(),
    retryCondition: isRetriableError,
    retryDelay: getDelay,
    shouldResetTimeout: true,
    onRetry,
  });

  return client;
}

export function getClient(type: ClientType): AxiosInstance {
  if (_clients[type] === null) {
    _clients[type] = createClient(type);
  }

  return _clients[type] as AxiosInstance;
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
      Authorization: 'Bearer ***',
      ['x-currents-key']: '***',
    },
  };
}

function getPayloadDebugData(data: any) {
  if (data?.results?.raw) {
    return {
      ...data,
      results: {
        ...data.results,
        raw: '***',
      },
    };
  }
  return data;
}
