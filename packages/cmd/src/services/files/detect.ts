import { getArtifactByExtension } from '@lib/artifactTypes';
import path from 'path';
import { FILE_TYPES, FileType } from './types';

/** The image types the API takes as a screenshot. */
const SCREENSHOT_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

const isZip = (fileName: string) =>
  path.extname(fileName).toLowerCase() === '.zip';

export function isFileType(value: string): value is FileType {
  return (FILE_TYPES as readonly string[]).includes(value);
}

export function getContentType(fileName: string) {
  if (isZip(fileName)) return 'application/zip';
  return (
    getArtifactByExtension(fileName)?.contentType ?? 'application/octet-stream'
  );
}

/**
 * The API checks the content type against the type: a trace is a zip, a
 * screenshot an image, a video a video. Anything fits an attachment.
 */
export function guessFileType(fileName: string): FileType {
  if (isZip(fileName)) return 'trace';
  return getArtifactByExtension(fileName)?.type ?? 'attachment';
}

/**
 * The guess, or an attachment where the target takes nothing else: a zip of
 * logs on a CI run is an attachment, not a trace.
 */
export function getFileType(
  fileName: string,
  allowedTypes: readonly FileType[]
): FileType {
  const guess = guessFileType(fileName);
  return allowedTypes.includes(guess) ? guess : 'attachment';
}

export function assertTypeAllowed(
  fileName: string,
  type: FileType,
  allowedTypes: readonly FileType[]
) {
  if (!allowedTypes.includes(type)) {
    throw new Error(
      `Cannot attach "${fileName}" as type "${type}" here. The target takes: ${allowedTypes.join(', ')}`
    );
  }
}

/**
 * An explicit `--type` is checked here so the user sees the mismatch before
 * the API rejects the request.
 */
export function assertTypeMatchesFile(fileName: string, type: FileType) {
  const contentType = getContentType(fileName);
  const matches =
    type === 'attachment' ||
    (type === 'trace' && contentType === 'application/zip') ||
    (type === 'screenshot' && SCREENSHOT_TYPES.includes(contentType)) ||
    (type === 'video' && contentType.startsWith('video/'));
  if (!matches) {
    throw new Error(
      `Cannot attach "${fileName}" as type "${type}": its content type is ${contentType}`
    );
  }
}
