import retry from "async-retry";
import { AxiosProgressEvent, isAxiosError, RawAxiosRequestConfig } from "axios";
import { debug as _debug } from "../../debug";
import { getAxios } from "../../http/axios";
import { error, warn } from "../../logger";

const debug = _debug.extend("upload");

const UPLOAD_RETRY_COUNT = 5;

export enum ContentType {
  JSON = "application/json",
  ZIP = "application/zip",
}

export type BufferUpload = {
  name: string | null;
  buffer: Buffer;
  uploadUrl: string;
  contentType: string;
};

export async function sendBuffer(
  upload: BufferUpload,
  contentType: string,
  onUploadProgress: RawAxiosRequestConfig["onUploadProgress"]
) {
  debug("Uploading buffer %s", upload.name, {
    buffer: Buffer.byteLength(upload.buffer),
  });
  return send(upload.buffer, upload.uploadUrl, contentType, onUploadProgress);
}

async function _send(
  buffer: Buffer,
  url: string,
  contentType: string,
  onUploadProgress: RawAxiosRequestConfig["onUploadProgress"]
) {
  return getAxios().request({
    method: "put",
    url,
    data: buffer,
    onUploadProgress,
    headers: {
      "Content-Disposition": `inline`,
      "Content-Type": contentType,
    },
  });
}

export async function download(
  url: string,
  onDownloadProgress?: RawAxiosRequestConfig["onDownloadProgress"]
): Promise<Buffer> {
  try {
    const response = await getAxios().get(url, {
      responseType: "arraybuffer",
      onDownloadProgress,
    });

    return Buffer.from(response.data);
  } catch (error) {
    if (isAxiosError(error)) {
      debug("Failed to download %s: %s", url, error.message);
    }
    throw error;
  }
}

async function send(...args: Parameters<typeof _send>) {
  await retry(
    async () => {
      await _send(...args);
    },
    {
      retries: UPLOAD_RETRY_COUNT,
      onRetry: (e: Error, retryCount: number) => {
        debug(
          "Upload failed %d out of %d attempts: %s",
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
        "Uploading %s: %d / %d",
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
        "Downloaded %s: %d / %d (%d%)",
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
