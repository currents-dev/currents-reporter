import { AxiosRequestConfig } from 'axios';
import { ClientType, getClient } from '../http/client';
import { getAuthHeaders } from './auth';

/**
 * A request to any path of the REST API, for `currents api`. The body of the
 * response stays the text the server sent, so that the command can print it
 * as it is. A response that is not 2xx throws an AxiosError that holds it.
 */
export function requestRestApi(
  apiKey: string,
  config: Pick<
    AxiosRequestConfig,
    'method' | 'url' | 'params' | 'data' | 'headers'
  >
) {
  return getClient(ClientType.REST_API).request<string>({
    ...config,
    headers: {
      ...getAuthHeaders({ apiKey }),
      ...config.headers,
    },
    responseType: 'text',
    transformResponse: (data) => data,
  });
}
