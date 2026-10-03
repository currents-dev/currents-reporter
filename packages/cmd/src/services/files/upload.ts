import { sendFile } from '../../http/storage';
import { LocalFile } from './types';

const CONCURRENCY = 4;

export type UploadOutcome = { file: LocalFile; error?: Error };

/**
 * Streams each file with the retries `sendFile` has, a few at a time. The
 * result tells which files arrived: one that fails does not stop the others.
 */
export async function uploadFiles(
  uploads: {
    file: LocalFile;
    uploadUrl: string;
    uploadHeaders?: Record<string, string>;
  }[]
): Promise<UploadOutcome[]> {
  const outcomes: UploadOutcome[] = [];
  for (let i = 0; i < uploads.length; i += CONCURRENCY) {
    outcomes.push(
      ...(await Promise.all(
        uploads
          .slice(i, i + CONCURRENCY)
          .map(async ({ file, uploadUrl, uploadHeaders }) => {
            try {
              await sendFile({
                name: file.name,
                path: file.path,
                sizeBytes: file.sizeBytes,
                uploadUrl,
                contentType: file.contentType,
                headers: uploadHeaders,
              });
              return { file };
            } catch (e) {
              return { file, error: e as Error };
            }
          })
      ))
    );
  }
  return outcomes;
}
