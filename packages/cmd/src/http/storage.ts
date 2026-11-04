import fs from 'fs';
import { Readable } from 'stream';
import { setTimeout as sleep } from 'timers/promises';
import { debug as _debug } from '../debug';
import { error, warn } from '../logger';
import { urlForLog } from '../lib/url';
import { isHttpError, RequestBody, sendRequest } from './send';

const debug = _debug.extend('upload');

const UPLOAD_RETRY_COUNT = 5;

export enum ContentType {
  JSON = 'application/json',
  ZIP = 'application/zip',
}

export type BufferUpload = {
  name: string | null;
  buffer: Buffer;
  uploadUrl: string;
  contentType: string;
  /**
   * Sent instead of the default headers. A signed URL that pins headers is
   * refused when the request carries others.
   */
  headers?: Record<string, string>;
};

export type UploadProgress = { loaded: number; total?: number };

export async function sendBuffer(
  upload: BufferUpload,
  contentType: string,
  onUploadProgress?: (progress: UploadProgress) => void
) {
  debug('Uploading buffer %s', upload.name, {
    buffer: Buffer.byteLength(upload.buffer),
  });
  return send(
    upload.buffer,
    upload.uploadUrl,
    contentType,
    onUploadProgress,
    upload.headers,
    getUploadTimeoutMs(Buffer.byteLength(upload.buffer))
  );
}

export type FileUpload = {
  name: string;
  path: string;
  sizeBytes: number;
  uploadUrl: string;
  contentType: string;
  headers?: Record<string, string>;
};

/** Slowest upload speed a file upload waits for before it is retried. */
const MIN_UPLOAD_BYTES_PER_SECOND = 256 * 1024;
const UPLOAD_TIMEOUT_BASE_MS = 2 * 60 * 1000;

/**
 * Streams a file from disk. The size is sent as Content-Length, as signed URLs
 * that pin it require, and a retry opens the file again. Exactly `sizeBytes`
 * are read, so a log that grows or shrinks during the upload cannot make the
 * body disagree with Content-Length.
 */
export async function sendFile(upload: FileUpload) {
  debug('Uploading file %s', upload.name, { bytes: upload.sizeBytes });
  return send(
    () =>
      upload.sizeBytes > 0
        ? fs.createReadStream(upload.path, { end: upload.sizeBytes - 1 })
        : Readable.from([]),
    upload.uploadUrl,
    upload.contentType,
    undefined,
    {
      ...(upload.headers ?? { 'Content-Type': upload.contentType }),
      'Content-Length': String(upload.sizeBytes),
    },
    getUploadTimeoutMs(upload.sizeBytes)
  );
}

/** The timeout is for the whole request, so the limit grows with the file. */
export function getUploadTimeoutMs(sizeBytes: number) {
  return (
    UPLOAD_TIMEOUT_BASE_MS +
    Math.ceil(sizeBytes / MIN_UPLOAD_BYTES_PER_SECOND) * 1000
  );
}

async function _send(
  body: Buffer | (() => Readable),
  url: string,
  contentType: string,
  onUploadProgress?: (progress: UploadProgress) => void,
  headers?: Record<string, string>,
  timeout?: number
) {
  const data: RequestBody = typeof body === 'function' ? body() : body;
  await sendRequest({
    method: 'PUT',
    url,
    timeout,
    body: data,
    headers: headers ?? {
      'Content-Disposition': `inline`,
      'Content-Type': contentType,
    },
  });
  if (Buffer.isBuffer(data)) {
    onUploadProgress?.({ loaded: data.length, total: data.length });
  }
}

export async function download(url: string): Promise<Buffer> {
  try {
    const response = await sendRequest<Buffer>({
      method: 'GET',
      url,
      responseType: 'buffer',
    });
    return response.data;
  } catch (error) {
    if (isHttpError(error)) {
      debug('Failed to download %s: %s', urlForLog(url), error.message);
    }
    throw error;
  }
}

/** S3 error codes that a 4xx answers with but that pass on a new attempt. */
const TRANSIENT_STORAGE_CODES = [
  'RequestTimeout',
  'OperationAborted',
  'SlowDown',
];

/**
 * Storage text for the terminal: no control characters, no signed query
 * strings, at most 200 characters.
 */
function cleanStorageText(text?: string) {
  if (!text) return undefined;
  return text
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, '')
    .replace(/\b[a-z][a-z0-9+.-]*:\/\/\S+/gi, (url) => urlForLog(url))
    .slice(0, 200);
}

/**
 * The code and message of an S3 compatible XML error document, for example
 * `AccessDenied` and `Request has expired`.
 */
function readStorageError(e: unknown) {
  const data = isHttpError(e) ? e.response?.data : undefined;
  const body = typeof data === 'string' ? data : '';
  return {
    code: body.match(/<Code>([^<]*)<\/Code>/)?.[1],
    message: cleanStorageText(body.match(/<Message>([^<]*)<\/Message>/)?.[1]),
  };
}

/**
 * A 4xx from storage is final: an expired or refused signed URL answers the
 * same on every attempt. 408, 429 and the S3 codes in
 * `TRANSIENT_STORAGE_CODES` are worth repeating.
 */
export function isFinalUploadError(e: unknown) {
  const status = isHttpError(e) ? e.response?.status : undefined;
  if (status === undefined || status < 400 || status >= 500) return false;
  if (status === 408 || status === 429) return false;
  const { code } = readStorageError(e);
  return !(code && TRANSIENT_STORAGE_CODES.includes(code));
}

/** What storage said, for example `403 AccessDenied: Request has expired`. */
export function describeUploadError(e: unknown) {
  if (!isHttpError(e) || !e.response)
    return e instanceof Error ? e : new Error(String(e));
  const { code, message } = readStorageError(e);
  const detail = [cleanStorageText(code), message].filter(Boolean).join(': ');
  return new Error(
    `storage answered ${e.response.status}${detail ? ` ${detail}` : ''}`
  );
}

async function send(...args: Parameters<typeof _send>) {
  try {
    await sendWithRetries(args);
  } catch (e) {
    throw describeUploadError(e);
  }
}

/**
 * Waits before each retry as async-retry did: 1, 2, 4, 8 and 16 seconds, each
 * multiplied by a random factor between 1 and 2, shortest first.
 */
function getRetryDelays() {
  return Array.from({ length: UPLOAD_RETRY_COUNT }, (_, i) =>
    Math.round((Math.random() + 1) * 1000 * 2 ** i)
  ).sort((a, b) => a - b);
}

/**
 * async-retry rejected with the error that failed the most attempts, the
 * latest of those that failed as many.
 */
function mostFrequentError(errors: Error[]) {
  const counts = new Map<string, number>();
  let result = errors[0];
  let max = 0;
  for (const e of errors) {
    const count = (counts.get(e.message) ?? 0) + 1;
    counts.set(e.message, count);
    if (count >= max) {
      result = e;
      max = count;
    }
  }
  return result;
}

async function sendWithRetries(args: Parameters<typeof _send>) {
  const delays = getRetryDelays();
  const errors: Error[] = [];
  for (let attempt = 1; ; attempt++) {
    try {
      return await _send(...args);
    } catch (e) {
      if (isFinalUploadError(e)) throw e;
      errors.push(e as Error);
      if (attempt > UPLOAD_RETRY_COUNT) throw mostFrequentError(errors);
      onRetry(e as Error, attempt);
      await sleep(delays[attempt - 1]);
    }
  }
}

function onRetry(e: Error, retryCount: number) {
  debug(
    'Upload failed %d out of %d attempts: %s',
    retryCount,
    UPLOAD_RETRY_COUNT,
    e.message
  );
  if (retryCount === UPLOAD_RETRY_COUNT) {
    error(`Cannot upload after ${retryCount} times: ${e.message}`);
    return;
  }
  warn(
    `Upload failed ${retryCount} out of ${UPLOAD_RETRY_COUNT} attempts: ${e.message}`
  );
}

export const getDefautUploadProgressHandler =
  (label: string) =>
  ({ total, loaded }: UploadProgress) => {
    debug(
      'Uploading %s: %d / %d',
      label,
      bytesToMb(loaded),
      bytesToMb(total ?? 0)
    );
  };

function bytesToMb(bytes: number) {
  return bytes / 1000 / 1000;
}
