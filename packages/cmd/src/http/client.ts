import axios, { AxiosInstance } from "axios";
import axiosRetry from "axios-retry";
import _ from "lodash";
import { nanoid } from "nanoid";

import { debug as _debug } from "../debug";
import { getAPIBaseUrl, getTimeout } from "./httpConfig";
import {
  getDelay,
  getMaxRetries,
  isRetriableError,
  onRetry,
} from "./httpRetry";

const debug = _debug.extend("http");

let _client: AxiosInstance | null = null;

export function createClient() {
  const client = axios.create({
    baseURL: getAPIBaseUrl(),
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
    const retry = config["axios-retry"]?.retryCount ?? 0;

    // const currentsConfig = getCurrentsConfig();
    // config.headers.set({
    //   ...headers,
    //   "x-currents-idempotency-key":
    //     config.headers["x-currents-idempotency-key"] ?? nanoid(),
    //   "x-jest-request-attempt": retry,
    //   "x-currents-key": currentsConfig?.recordKey ?? null,
    // });

    // if (currentsConfig?.machineId) {
    //   config.headers.set("x-currents-machine-id", currentsConfig.machineId);
    // }

    if (!config.headers.get("Content-Type")) {
      config.headers.set("Content-Type", "application/json");
    }

    const args = {
      ..._.pick(config, "method", "url", "headers"),
      data: Buffer.isBuffer(config.data) ? "buffer" : (config.data as unknown),
    };

    if (!retry) {
      debug("network request: %o", getNetworkRequestDebugData(args));
    } else {
      debug(
        "network request retry: %o",
        getNetworkRequestDebugData({
          ...args,
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

export function getClient() {
  if (_client) {
    return _client;
  }
  _client = createClient();
  return _client;
}

function getNetworkRequestDebugData(data: {
  headers: Record<string, string>;
  method?: string;
  url?: string;
  data: unknown;
  isRetry?: boolean;
}) {
  return {
    method: data.method,
    baseUrl: getAPIBaseUrl(),
    url: data.url,
    data: data.isRetry ? "<retry>" : getPayloadDebugData(data.data),
    headers: {
      ...data.headers,
      ["x-currents-key"]: "***",
    },
  };
}

function getPayloadDebugData(data: any) {
  if (data?.results?.raw) {
    return {
      ...data,
      results: {
        ...data.results,
        raw: "***",
      },
    };
  }
  return data;
}
