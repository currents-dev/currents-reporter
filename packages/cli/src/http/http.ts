import { AxiosError, AxiosRequestConfig, AxiosResponse } from "axios";
import _ from "lodash";

import { debug as _debug } from "../debug";
import { getClient } from "./client";
import { handleHTTPError } from "./httpErrors";

const debug = _debug.extend("http");

export async function makeRequest<T = any, D = any>(
  config: AxiosRequestConfig<D>,
  _getClient = getClient
) {
  try {
    const res = await _getClient().request<T, AxiosResponse<T, D>>(config);
    debug("network response: %o", {
      ..._.omit(res, "request", "config"),
      url: res.config.url,
      method: res.config.method,
    });
    return res;
  } catch (_error) {
    const error = _error as AxiosError;
    debug("network error: %o", {
      code: error.code,
      message: error.message,
      url: error.config?.url,
      method: error.config?.method,
      status: error.response?.status,
      headers: error.response?.headers,
      data: error.response?.data,
    });
    handleHTTPError<T, D>(error);
    throw error;
  }
}
