import path from 'path';

export type ArtifactKind = 'screenshot' | 'video' | 'attachment';

/**
 * The type and content type of a file by its extension, for the files that
 * `currents session attach` / `run attach` and the Detox upload send. A screenshot
 * is one of the four image types the API takes as a screenshot; any other file is
 * an attachment. Content types have no parameters, as the API checks them.
 */
export const ARTIFACT_BY_EXTENSION: Record<
  string,
  { type: ArtifactKind; contentType: string }
> = {
  '.png': { type: 'screenshot', contentType: 'image/png' },
  '.jpg': { type: 'screenshot', contentType: 'image/jpeg' },
  '.jpeg': { type: 'screenshot', contentType: 'image/jpeg' },
  '.webp': { type: 'screenshot', contentType: 'image/webp' },
  '.gif': { type: 'screenshot', contentType: 'image/gif' },
  '.mp4': { type: 'video', contentType: 'video/mp4' },
  '.webm': { type: 'video', contentType: 'video/webm' },
  '.svg': { type: 'attachment', contentType: 'image/svg+xml' },
  '.log': { type: 'attachment', contentType: 'text/plain' },
  '.txt': { type: 'attachment', contentType: 'text/plain' },
  '.yml': { type: 'attachment', contentType: 'text/plain' },
  '.yaml': { type: 'attachment', contentType: 'text/plain' },
  '.md': { type: 'attachment', contentType: 'text/markdown' },
  '.html': { type: 'attachment', contentType: 'text/html' },
  '.csv': { type: 'attachment', contentType: 'text/csv' },
  '.json': { type: 'attachment', contentType: 'application/json' },
  '.pdf': { type: 'attachment', contentType: 'application/pdf' },
  '.gz': { type: 'attachment', contentType: 'application/gzip' },
  '.viewhierarchy': { type: 'attachment', contentType: 'application/xml' },
};

export const getArtifactByExtension = (fileName: string) =>
  ARTIFACT_BY_EXTENSION[path.extname(fileName).toLowerCase()];
