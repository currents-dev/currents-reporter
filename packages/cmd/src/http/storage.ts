import retry from 'async-retry';
import fs from 'fs';
import { Readable } from 'stream';
import { AxiosProgressEvent, isAxiosError, RawAxiosRequestConfig } from 'axios';
import { debug as _debug } from '../debug';
import { getAxios } from './axios';
import { error, warn } from '../logger';

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

export async function sendBuffer(
  upload: BufferUpload,
  contentType: string,
  onUploadProgress: RawAxiosRequestConfig['onUploadProgress']
) {
  debug('Uploading buffer %s', upload.name, {
    buffer: Buffer.byteLength(upload.buffer),
  });
  return send(
    upload.buffer,
    upload.uploadUrl,
    contentType,
    onUploadProgress,
    upload.headers
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

/**
 * Streams a file from disk. The size is sent as Content-Length, as signed URLs
 * that pin it require, and a retry opens the file again.
 */
export async function sendFile(upload: FileUpload) {
  debug('Uploading file %s', upload.name, { bytes: upload.sizeBytes });
  return send(
    () => fs.createReadStream(upload.path),
    upload.uploadUrl,
    upload.contentType,
    undefined,
    {
      ...(upload.headers ?? { 'Content-Type': upload.contentType }),
      'Content-Length': String(upload.sizeBytes),
    }
  );
}

async function _send(
  body: Buffer | (() => Readable),
  url: string,
  contentType: string,
  onUploadProgress: RawAxiosRequestConfig['onUploadProgress'],
  headers?: Record<string, string>
) {
  return getAxios().request({
    method: 'put',
    url,
    data: typeof body === 'function' ? body() : body,
    // The redirect handler keeps a copy of the whole body in memory. A signed
    // upload URL does not redirect.
    ...(typeof body === 'function' && { maxRedirects: 0 }),
    onUploadProgress,
    headers: headers ?? {
      'Content-Disposition': `inline`,
      'Content-Type': contentType,
    },
  });
}

export async function download(
  url: string,
  onDownloadProgress?: RawAxiosRequestConfig['onDownloadProgress']
): Promise<Buffer> {
  try {
    const response = await getAxios().get(url, {
      responseType: 'arraybuffer',
      onDownloadProgress,
    });

    return Buffer.from(response.data);
  } catch (error) {
    if (isAxiosError(error)) {
      debug('Failed to download %s: %s', url, error.message);
    }
    throw error;
  }
}

/**
 * A 4xx from storage is final: an expired or refused signed URL answers the
 * same on every attempt. 408 and 429 are the ones worth repeating.
 */
export function isFinalUploadError(e: unknown) {
  const status = isAxiosError(e) ? e.response?.status : undefined;
  return (
    status !== undefined &&
    status >= 400 &&
    status < 500 &&
    status !== 408 &&
    status !== 429
  );
}

/**
 * What storage said, for example `403 AccessDenied: Request has expired`. S3
 * compatible storage answers with an XML error document.
 */
export function describeUploadError(e: unknown) {
  if (!isAxiosError(e) || !e.response)
    return e instanceof Error ? e : new Error(String(e));
  const body = typeof e.response.data === 'string' ? e.response.data : '';
  const code = body.match(/<Code>([^<]*)<\/Code>/)?.[1];
  const message = body.match(/<Message>([^<]*)<\/Message>/)?.[1];
  const detail = [code, message].filter(Boolean).join(': ');
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

async function sendWithRetries(args: Parameters<typeof _send>) {
  await retry(
    async (bail) => {
      try {
        await _send(...args);
      } catch (e) {
        if (isFinalUploadError(e)) {
          bail(e as Error);
          return;
        }
        throw e;
      }
    },
    {
      retries: UPLOAD_RETRY_COUNT,
      onRetry: (e: Error, retryCount: number) => {
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
      },
    }
  );
}

export const getDefautUploadProgressHandler =
  (label: string) =>
  ({ total, loaded }: AxiosProgressEvent) => {
    () => {
      debug(
        'Uploading %s: %d / %d',
        label,
        bytesToMb(loaded),
        bytesToMb(total ?? 0)
      );
    };
  };

export const getDefaultDownloadProgressHandler =
  (label: string) =>
  ({ loaded, total }: AxiosProgressEvent) => {
    () => {
      const percentCompleted = total ? Math.round((loaded * 100) / total) : 0;
      debug(
        'Downloaded %s: %d / %d (%d%)',
        label,
        bytesToMb(loaded),
        bytesToMb(total ?? 0),
        percentCompleted
      );
    };
  };

function bytesToMb(bytes: number) {
  return bytes / 1000 / 1000;
}
