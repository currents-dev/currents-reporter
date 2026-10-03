import { AxiosError, AxiosRequestConfig, isAxiosError } from 'axios';
import prettyMilliseconds from 'pretty-ms';

import { warn } from '@logger';
import { debug as _debug } from '../debug';

const debug = _debug.extend('http');

const DEFAULT_DELAYS = [3 * 1000, 15 * 1000, 30 * 1000];

/** The longest `Retry-After` the CLI waits for. */
export const MAX_RETRY_AFTER_MS = 60 * 1000;

/**
 * `Retry-After` as milliseconds, from seconds or an HTTP date. Undefined when
 * the header is absent or unreadable.
 */
export function getRetryAfterMs(err?: AxiosError, now = Date.now()) {
  const value = err?.response?.headers?.['retry-after'];
  if (value === undefined || value === null || value === '') return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(String(value));
  return Number.isNaN(date) ? undefined : Math.max(0, date - now);
}

/**
 * The default delay, or the server's `Retry-After` when it is longer, up to
 * `MAX_RETRY_AFTER_MS`. A proxy that answers `Retry-After: 3600` must not hold
 * a CI job for hours, and `Retry-After: 0` must not retry at once.
 */
export const getDelay = (i: number, err?: AxiosError) => {
  const defaultDelay = DEFAULT_DELAYS[Math.min(i, DEFAULT_DELAYS.length) - 1];
  const retryAfter = getRetryAfterMs(err);
  if (retryAfter === undefined) return defaultDelay;
  return Math.min(Math.max(retryAfter, defaultDelay), MAX_RETRY_AFTER_MS);
};

export const isRetriableError = (err: AxiosError | Error): boolean => {
  debug('isRetriableError: %o', {
    message: err.message,
    code: 'code' in err ? err.code : undefined,
    status: 'response' in err ? err.response?.status : undefined,
    headers: 'response' in err ? err.response?.headers : undefined,
    data: 'response' in err ? err.response?.data : undefined,
    isAxiosError: isAxiosError(err),
  });

  if (
    'code' in err &&
    err.code &&
    // https://man7.org/linux/man-pages/man3/errno.3.html
    [
      'ECONNABORTED',
      'ECONNREFUSED',
      'ECONNRESET',
      'ETIMEDOUT',
      'ENETRESET',
    ].includes(err.code)
  ) {
    return true;
  }

  if (!isAxiosError(err)) {
    return false;
  }

  return [408, 429, 502, 503, 504].includes(err.response?.status ?? 0);
};

/** Methods that give the same result when repeated (RFC 9110, section 9.2.2). */
const IDEMPOTENT_METHODS = ['get', 'head', 'options', 'put', 'delete'];

/**
 * For the REST API. A POST or PATCH is not repeated once the server may have
 * handled it: after a 502, 503 or 504, or a dropped connection, the first
 * request can still have succeeded. It is repeated when the server refused it
 * (429) or never got all of it (408, connection refused). A `Retry-After` longer than a
 * minute stops the retries; the error says how long.
 */
export const isRetriableRestError = (err: AxiosError | Error): boolean => {
  if (!isAxiosError(err)) return false;
  const status = err.response?.status;

  if (status === 429) {
    const wait = getRetryAfterMs(err);
    return wait === undefined || wait <= MAX_RETRY_AFTER_MS;
  }
  if (IDEMPOTENT_METHODS.includes(err.config?.method?.toLowerCase() ?? 'get')) {
    return isRetriableError(err);
  }
  return (
    status === 408 || err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND'
  );
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
    prettyMilliseconds(getDelay(retryCount, err) ?? 0),
    retryCount,
    getMaxRetries()
  );
  warn(
    "Network request '%s' failed: '%s'. Next attempt is in %s (%d/%d).",
    `${_config.method?.toUpperCase()} ${_config.url}`,
    err.message,
    prettyMilliseconds(getDelay(retryCount, err) ?? 0),
    retryCount,
    getMaxRetries()
  );
}
