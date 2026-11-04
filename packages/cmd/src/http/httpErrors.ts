import * as log from '@logger';
import _ from 'lodash';
import { HttpError, isHttpError } from './send';

export function handleHTTPError(error: unknown) {
  if (!isHttpError(error)) {
    log.warn(`Unexpected error while sending network request: %s`, error);
    return;
  }

  switch (error.code) {
    case 'ECONNABORTED':
    case 'ECONNREFUSED':
      log.warn(`Network connection aborted`);
      return;
    case 'ECONNRESET':
      log.warn(`Network connection reset`);
      return;
    case 'ETIMEDOUT':
      log.warn(`Network connection timeout`);
      return;
  }

  if (error.response) {
    handle4xx(error, error.response.status, error.response.data);
    return;
  }

  // Kept for the same output: these were read from the response, which this
  // request did not get.
  log.warn('[currents] Unexpected network error: %s\n%O', error.message, {
    method: undefined,
    url: undefined,
    status: undefined,
    payload: undefined,
  });
}

function handle4xx(error: HttpError, status: number, data: unknown) {
  const { method, url } = error.config;
  switch (status) {
    case 401:
      log.warn(
        `[currents] ${method} ${url} - 401 Unauthorized Request from cloud service`
      );
      return;
    case 400:
      log.warn(
        `[currents] ${method} ${url} - 400 Bad Request from cloud service:\n%o`,
        data
      );
      return;
    case 404:
      log.warn(
        `[currents] ${method} ${url} - 404 Not Found from cloud service`
      );
      return;
    case 429:
      log.warn(
        `[currents] ${method} ${url} - 429 Too Many Requests from cloud service`
      );
      return;
    case 422:
      handle422Error(error, data);
      return;
    default:
      warnUnexpectedResponse(error);
  }
}

function warnUnexpectedResponse(error: HttpError) {
  log.warn('[currents] Unexpected network response: %s\n%O', error.message, {
    method: error.config.method,
    url: error.config.url,
    status: error.response?.status,
  });
}

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every(_.isString);

function handle422Error(error: HttpError, data: unknown) {
  const { code, message, errors } = (data ?? {}) as Record<string, unknown>;

  if (
    code === ErrorCodes.MISSING_SUITE &&
    _.isString(message) &&
    isStringArray(errors)
  ) {
    log.spacer(1);
    log.error(...formatGenericCloudError(message, errors));
    return;
  }
  if (code === ErrorCodes.RUN_EXPIRED && _.isString(message)) {
    log.warn(message);
    return;
  }
  if (_.isString(message) && isStringArray(errors)) {
    log.spacer(1);
    log.warn(...formatGenericCloudError(message, errors));
    log.spacer(1);
    return;
  }
  warnUnexpectedResponse(error);
}

const ErrorCodes = {
  RUN_CANCELLED: 'RUN_CANCELLED',
  RUN_EXPIRED: 'RUN_EXPIRED',
  MISSING_SUITE: 'MISSING_SUITE',
} as const;

export function formatGenericCloudError(
  message?: string,
  errors?: string[]
): string[] {
  if (!_.isString(message)) {
    return ['Unexpected network error'];
  }

  if (errors?.length === 0) {
    return [message as string];
  }
  return [
    message as string,
    `
${(errors ?? []).map((e) => `  - ${e}`).join('\n')}
`,
  ];
}
