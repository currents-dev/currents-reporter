import { debug as _debug } from '../debug';
import { ClientType, getClient, RequestConfig } from './client';
import { handleHTTPError } from './httpErrors';
import { HttpError } from './send';

const debug = _debug.extend('http');

export async function makeRequest<T = any>(
  clientType: ClientType,
  config: RequestConfig,
  _getClient = getClient
) {
  try {
    const res = await _getClient(clientType).request<T>(config);
    debug('network response: %o', {
      ...res,
      url: config.url,
      method: config.method.toLowerCase(),
    });
    return res;
  } catch (_error) {
    const error = _error as HttpError;
    debug('network error: %o', {
      code: error.code,
      message: error.message,
      url: error.config?.url,
      method: error.config?.method,
      status: error.response?.status,
      headers: error.response?.headers,
      data: error.response?.data,
    });
    handleHTTPError(error);
    throw error;
  }
}
