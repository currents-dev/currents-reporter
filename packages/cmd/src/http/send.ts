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
  /**
   * Milliseconds until the headers of the response, redirects included, and
   * then between two parts of its body. 0 is no limit.
   */
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
  const { res, method } = await receiveHeaders(req, failed);
  const response = await readResponse<T>(
    res,
    method,
    req.responseType ?? 'json',
    failed
  );
  if (response.status < 200 || response.status >= 300) {
    throw new HttpError(
      `Request failed with status code ${response.status}`,
      response.status < 500 ? 'ERR_BAD_REQUEST' : 'ERR_BAD_RESPONSE',
      failed,
      response
    );
  }
  return response;
}

/**
 * The timeout runs until the headers of the response arrive. After that it is
 * the longest wait for the next part of the body, as the socket timeout of
 * axios was.
 */
async function receiveHeaders(req: HttpRequest, failed: FailedRequest) {
  const timeout = req.timeout ?? 0;
  const controller = new AbortController();
  const timer =
    timeout > 0 ? setTimeout(() => controller.abort(), timeout) : undefined;
  try {
    return await sendFollowingRedirects(req, controller.signal, timeout);
  } catch (e) {
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

async function sendFollowingRedirects(
  req: HttpRequest,
  signal: AbortSignal,
  bodyTimeout: number
) {
  let { url, body } = req;
  let method = req.method.toUpperCase();
  let headers = withDefaultHeaders(req.headers ?? {}, body);

  for (let redirects = 0; ; redirects++) {
    const res = await request(url, {
      method,
      headers,
      body,
      signal,
      bodyTimeout,
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
      return { res, method };
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

const isKnownEncoding = (encoding: string) =>
  ['gzip', 'x-gzip', 'compress', 'x-compress', 'deflate', 'br'].includes(
    encoding
  );

function decompress(body: Buffer, encoding: string) {
  if (encoding === 'br') return brotliDecompress(body);
  // A deflate body may come without the zlib header.
  if (encoding === 'deflate') return unzip(body).catch(() => inflateRaw(body));
  return unzip(body);
}

/**
 * A failure after the headers arrived has the response, as with axios: it is
 * not retried, and the messages name its status.
 */
async function readResponse<T>(
  res: Awaited<ReturnType<typeof request>>,
  method: string,
  responseType: ResponseType,
  failed: FailedRequest
): Promise<HttpResponse<T>> {
  const headers = { ...res.headers };
  const encoding = String(headers['content-encoding'] ?? '').toLowerCase();
  if (encoding && isKnownEncoding(encoding)) delete headers['content-encoding'];
  const head = { status: res.statusCode, statusText: res.statusText, headers };

  // No body, whatever Content-Length says.
  if (method === 'HEAD' || res.statusCode === 204 || res.statusCode === 304) {
    delete headers['content-encoding'];
    await res.body.dump();
    return { ...head, data: parseBody(Buffer.alloc(0), responseType) as T };
  }

  let body: Buffer;
  try {
    body = Buffer.from(await res.body.arrayBuffer());
  } catch {
    // The body was cut off or stopped for longer than the timeout.
    throw new HttpError('stream has been aborted', 'ERR_BAD_RESPONSE', failed, {
      ...head,
      data: undefined,
    });
  }
  if (encoding && isKnownEncoding(encoding) && body.length > 0) {
    try {
      body = await decompress(body, encoding);
    } catch (e) {
      const error = e as Error & { code?: string };
      throw new HttpError(error.message, error.code, failed, {
        ...head,
        data: undefined,
      });
    }
  }
  return { ...head, data: parseBody(body, responseType) as T };
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

/**
 * undici checked the request and did not send it, for example for a header it
 * does not allow such as Keep-Alive, or a Content-Length that the body does not
 * have.
 */
export function isRefusedRequest(e: HttpError) {
  return [
    'UND_ERR_INVALID_ARG',
    'UND_ERR_NOT_SUPPORTED',
    'UND_ERR_REQ_CONTENT_LENGTH_MISMATCH',
  ].includes(e.code ?? '');
}
