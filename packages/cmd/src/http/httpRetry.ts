import { AxiosError, AxiosRequestConfig, isAxiosError } from "axios";
import prettyMilliseconds from "pretty-ms";

import { debug as _debug } from "../debug";
import { warn } from "../logger";

const debug = _debug.extend("http");

export const getDelay = (i: number) => [3 * 1000, 15 * 1000, 30 * 1000][i - 1];

export const isRetriableError = (err: AxiosError | Error): boolean => {
  debug("isRetriableError: %o", {
    message: err.message,
    code: "code" in err ? err.code : undefined,
    status: "response" in err ? err.response?.status : undefined,
    headers: "response" in err ? err.response?.headers : undefined,
    data: "response" in err ? err.response?.data : undefined,
    isAxiosError: isAxiosError(err),
  });

  if (
    "code" in err &&
    err.code &&
    // https://man7.org/linux/man-pages/man3/errno.3.html
    [
      "ECONNABORTED",
      "ECONNREFUSED",
      "ECONNRESET",
      "ETIMEDOUT",
      "ENETRESET",
    ].includes(err.code)
  ) {
    return true;
  }

  if (!isAxiosError(err)) {
    return false;
  }

  return [429, 502, 503, 504].includes(err.response?.status ?? 0);
};

export const getMaxRetries = () => 3;

export function onRetry(
  retryCount: number,
  err: AxiosError,
  _config: AxiosRequestConfig
) {
  debug(
    "Network request '%s' failed: '%s'. Next attempt is in %s (%d/%d).",
    `${_config.method?.toUpperCase()} ${_config.url}`,
    err.message,
    prettyMilliseconds(getDelay(retryCount)),
    retryCount,
    getMaxRetries()
  );
  warn(
    "Network request '%s' failed: '%s'. Next attempt is in %s (%d/%d).",
    `${_config.method?.toUpperCase()} ${_config.url}`,
    err.message,
    prettyMilliseconds(getDelay(retryCount)),
    retryCount,
    getMaxRetries()
  );
}
