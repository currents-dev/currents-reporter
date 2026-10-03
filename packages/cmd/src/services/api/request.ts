import { debug as _debug } from '@debug';
import { maskKeys } from '@lib';
import { AxiosResponse, isAxiosError } from 'axios';
import fs from 'fs-extra';
import { requestRestApi } from '../../api';
import { sharedConfigKeys } from '../../config/keys';
import { getValidatedConfig } from '../../config/utils';
import { getRestAPIBaseUrl } from '../../http/httpConfig';

const debug = _debug.extend('api');

export type Field = [key: string, value: unknown];

export type ApiRequestOptions = {
  apiKey?: string;
  method?: string;
  field?: Field[];
  rawField?: Field[];
  input?: string;
  header?: Field[];
  include?: boolean;
  debug?: boolean;
};

/**
 * The path relative to the REST API address. The REST API serves every route
 * under /v1, so "runs/<id>", "v1/runs/<id>" and "/v1/runs/<id>" are the same
 * route.
 */
export function restApiPath(path: string) {
  // A full URL would send the API key to whatever host it names.
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(path)) {
    throw new Error(
      `Pass a path such as /v1/runs/<run-id>, not a URL. The CLI sends requests to ${getRestAPIBaseUrl()}`
    );
  }
  const relative = path.replace(/^\/+/, '');
  return /^v1(\/|\?|$)/.test(relative) ? relative : `v1/${relative}`;
}

// A field whose key ends with "[]" adds its value to an array, the way the
// REST API reads repeated query parameters such as "branches[]".
function toBody(fields: Field[]) {
  // No prototype, so that a key such as `__proto__` is kept as a field.
  const body: Record<string, unknown> = Object.create(null);
  for (const [key, value] of fields) {
    if (key.endsWith('[]')) {
      const name = key.slice(0, -2);
      body[name] = [
        ...(Array.isArray(body[name]) ? (body[name] as unknown[]) : []),
        value,
      ];
    } else {
      body[key] = value;
    }
  }
  return body;
}

function toSearchParams(fields: Field[]) {
  const params = new URLSearchParams();
  for (const [key, value] of fields) params.append(key, String(value));
  return params;
}

async function readInput(file: string) {
  const text =
    file === '-'
      ? await new Promise<string>((resolve, reject) => {
          let data = '';
          process.stdin.setEncoding('utf8');
          process.stdin.on('data', (chunk) => (data += chunk));
          process.stdin.on('end', () => resolve(data));
          process.stdin.on('error', reject);
        })
      : await fs.readFile(file, 'utf8');
  try {
    return JSON.parse(text) as unknown;
  } catch (e) {
    throw new Error(
      `--input ${file} is not valid JSON: ${(e as Error).message}`
    );
  }
}

/**
 * Without --method, a request with fields or --input is a POST. Fields go to
 * the query string of a GET, and of any request whose body comes from --input.
 */
export async function buildRequest(path: string, options: ApiRequestOptions) {
  const fields = [...(options.field ?? []), ...(options.rawField ?? [])];
  const hasInput = options.input !== undefined;
  const method =
    options.method ?? (hasInput || fields.length > 0 ? 'POST' : 'GET');
  const fieldsInQuery = hasInput || method === 'GET' || method === 'HEAD';

  return {
    method,
    url: restApiPath(path),
    params:
      fieldsInQuery && fields.length > 0 ? toSearchParams(fields) : undefined,
    // Sent as text: axios copies an object body key by key, which drops a
    // `__proto__` key.
    data: hasInput
      ? JSON.stringify(await readInput(options.input as string))
      : !fieldsInQuery && fields.length > 0
        ? JSON.stringify(toBody(fields))
        : undefined,
    headers: Object.fromEntries(options.header ?? []) as Record<string, string>,
  };
}

function statusAndHeaders(response: AxiosResponse) {
  const headers = Object.entries(response.headers).map(
    ([name, value]) =>
      `${name}: ${Array.isArray(value) ? value.join(', ') : value}`
  );
  return [
    `HTTP/1.1 ${response.status} ${response.statusText}`,
    ...headers,
    '',
    '',
  ].join('\n');
}

// JSON is indented for a terminal. A pipe or a file gets the body the server
// sent, unchanged.
function formatBody(response: AxiosResponse<string>, isTTY: boolean) {
  const body = response.data ?? '';
  const isJSON = String(response.headers['content-type'] ?? '').includes(
    'json'
  );
  if (!isTTY || !isJSON || !body) return body;
  try {
    return JSON.stringify(JSON.parse(body), null, 2) + '\n';
  } catch {
    return body;
  }
}

export async function handleApiRequest(
  path: string,
  options: ApiRequestOptions
) {
  const { apiKey } = getValidatedConfig<
    typeof sharedConfigKeys,
    ApiRequestOptions
  >(sharedConfigKeys, ['apiKey'], options);
  debug('Options: %o', maskKeys(options));

  const request = await buildRequest(path, options);
  try {
    const response = await requestRestApi(apiKey as string, request);
    if (options.include) process.stdout.write(statusAndHeaders(response));
    process.stdout.write(formatBody(response, !!process.stdout.isTTY));
  } catch (e) {
    if (!isAxiosError(e)) throw e;
    const response = e.response as AxiosResponse<string> | undefined;
    if (!response) {
      throw new Error(
        `Could not reach the REST API at ${getRestAPIBaseUrl()}: ${e.message}`
      );
    }
    if (options.include) process.stderr.write(statusAndHeaders(response));
    const body = formatBody(response, !!process.stderr.isTTY);
    if (body) process.stderr.write(body.endsWith('\n') ? body : `${body}\n`);
    throw new Error(
      `${request.method} ${request.url} failed: the REST API answered ${response.status} ${response.statusText}`
    );
  }
}
