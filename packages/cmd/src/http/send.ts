import { IncomingHttpHeaders } from 'node:http';
import { Readable } from 'node:stream';
import { promisify } from 'node:util';
import zlib from 'node:zlib';
import { request } from 'undici';
import { getDispatcher } from './proxy';

export type RequestBody = string | Buffer | Readable;

export type ResponseType = 'json' | 'text' | 'buffer';

export type HttpRequest = {
  method: string;
  url: string;
  headers?: Record<string, string>;
  body?: RequestBody;
  /** Milliseconds for the whole request, redirects included. 0 is no limit. */
  timeout?: number;
  /** `json` parses a body that is JSON and keeps any other as text. */
  responseType?: ResponseType;
};

export type HttpResponse<T = any> = {
  status: number;
  statusText: string;
  headers: IncomingHttpHeaders;
  data: T;
};

/** The request a failure belongs to, for the messages that name it. */
export type FailedRequest = {
  /** Lowercase, as axios printed it. */
  method: string;
  url: string;
  data?: unknown;
};

/**
 * A response that is not 2xx, or a request that got no response. The message
 * and the code are the ones axios gave, for example
 * `Request failed with status code 503` and `ERR_BAD_RESPONSE`, or
 * `connect ECONNREFUSED 127.0.0.1:1234` and `ECONNREFUSED`.
 */
export class HttpError<T = any> extends Error {
  name = 'HttpError';
  constructor(
    message: string,
    public code: string | undefined,
    public config: FailedRequest,
    public response?: HttpResponse<T>
  ) {
    super(message);
  }

  get status() {
    return this.response?.status;
  }
}

export function isHttpError(e: unknown): e is HttpError {
  return e instanceof HttpError;
}

const MAX_REDIRECTS = 21;
const SENSITIVE_HEADERS = /^(?:(?:proxy-)?authorization|cookie)$/i;

/**
 * Sends one request and follows redirects as axios and follow-redirects did. A
 * stream body is not sent again, so a redirect answer to it is the response.
 */
export async function sendRequest<T = any>(
  req: HttpRequest
): Promise<HttpResponse<T>> {
  const failed: FailedRequest = {
    method: req.method.toLowerCase(),
    url: req.url,
    data: req.body,
  };
  const timeout = req.timeout ?? 0;
  const controller = new AbortController();
  const timer =
    timeout > 0 ? setTimeout(() => controller.abort(), timeout) : undefined;

  try {
    const response = await sendFollowingRedirects(req, controller.signal);
    if (response.status < 200 || response.status >= 300) {
      throw new HttpError(
        `Request failed with status code ${response.status}`,
        response.status < 500 ? 'ERR_BAD_REQUEST' : 'ERR_BAD_RESPONSE',
        failed,
        response
      );
    }
    return response;
  } catch (e) {
    if (e instanceof HttpError) throw e;
    if (controller.signal.aborted) {
      throw new HttpError(
        `timeout of ${timeout}ms exceeded`,
        'ETIMEDOUT',
        failed
      );
    }
    throw toNetworkError(e, failed);
  } finally {
    clearTimeout(timer);
  }
}

async function sendFollowingRedirects(req: HttpRequest, signal: AbortSignal) {
  let { url, body } = req;
  let method = req.method.toUpperCase();
  let headers = withDefaultHeaders(req.headers ?? {}, body);

  for (let redirects = 0; ; redirects++) {
    const res = await request(url, {
      method,
      headers,
      body,
      signal,
      dispatcher: getDispatcher(url),
      // undici closes the connection after a HEAD unless told not to.
      reset: false,
    });
    const location = res.headers.location;
    if (
      res.statusCode < 300 ||
      res.statusCode >= 400 ||
      typeof location !== 'string' ||
      body instanceof Readable
    ) {
      return readResponse<any>(res, method, req.responseType ?? 'json');
    }

    await res.body.dump();
    if (redirects >= MAX_REDIRECTS) {
      throw Object.assign(new Error('Maximum number of redirects exceeded'), {
        code: 'ERR_FR_TOO_MANY_REDIRECTS',
      });
    }

    if (
      ((res.statusCode === 301 || res.statusCode === 302) &&
        method === 'POST') ||
      (res.statusCode === 303 && !/^(?:GET|HEAD)$/.test(method))
    ) {
      method = 'GET';
      body = undefined;
      headers = omitHeaders(headers, /^content-/i);
    }
    const from = new URL(url);
    const to = new URL(location, from);
    if (
      (to.protocol !== from.protocol && to.protocol !== 'https:') ||
      (to.host !== from.host && !to.host.endsWith(`.${from.host}`))
    ) {
      headers = omitHeaders(headers, SENSITIVE_HEADERS);
    }
    url = to.href;
  }
}

/** The headers axios added when the request did not set them. */
function withDefaultHeaders(
  headers: Record<string, string>,
  body?: RequestBody
) {
  const result: Record<string, string> = {
    accept: 'application/json, text/plain, */*',
    // The REST API records the user agent of each call in its analytics.
    'user-agent': 'axios/1.20.0',
    'accept-encoding': 'gzip, compress, deflate, br',
  };
  if (body && !(body instanceof Readable)) {
    result['content-length'] = String(Buffer.byteLength(body));
  }
  for (const [name, value] of Object.entries(headers)) {
    result[name.toLowerCase()] = value;
  }
  return result;
}

function omitHeaders(headers: Record<string, string>, pattern: RegExp) {
  return Object.fromEntries(
    Object.entries(headers).filter(([name]) => !pattern.test(name))
  );
}

const unzip = promisify(zlib.unzip);
const inflateRaw = promisify(zlib.inflateRaw);
const brotliDecompress = promisify(zlib.brotliDecompress);

async function decompress(body: Buffer, encoding: string) {
  switch (encoding) {
    case 'gzip':
    case 'x-gzip':
    case 'compress':
    case 'x-compress':
      return unzip(body);
    case 'deflate':
      // A deflate body may come without the zlib header.
      return unzip(body).catch(() => inflateRaw(body));
    case 'br':
      return brotliDecompress(body);
    default:
      return undefined;
  }
}

async function readResponse<T>(
  res: Awaited<ReturnType<typeof request>>,
  method: string,
  responseType: ResponseType
): Promise<HttpResponse<T>> {
  const headers = { ...res.headers };
  let body = Buffer.from(await res.body.arrayBuffer());
  const encoding = String(headers['content-encoding'] ?? '').toLowerCase();
  if (encoding && (method === 'HEAD' || res.statusCode === 204)) {
    delete headers['content-encoding'];
  } else if (encoding && body.length > 0) {
    const decoded = await decompress(body, encoding);
    if (decoded) {
      body = decoded;
      delete headers['content-encoding'];
    }
  }

  return {
    status: res.statusCode,
    statusText: res.statusText,
    headers,
    data: parseBody(body, responseType) as T,
  };
}

function parseBody(body: Buffer, responseType: ResponseType) {
  if (responseType === 'buffer') return body;
  const text = body.toString('utf8').replace(/^\uFEFF/, '');
  if (responseType === 'text' || !text) return text;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

/**
 * The code and message Node's http gave for the same failure, which the
 * retries and the messages for users depend on.
 */
function toNetworkError(e: unknown, failed: FailedRequest) {
  const error = e as Error & { code?: string; errors?: Error[] };
  if (error.code === 'UND_ERR_SOCKET') {
    return new HttpError('socket hang up', 'ECONNRESET', failed);
  }
  // Each address of a host that has several, such as ::1 and 127.0.0.1.
  const message =
    !error.message && error.errors
      ? error.errors.map((e) => e.message).join('; ')
      : error.message;
  return new HttpError(message, error.code, failed);
}
