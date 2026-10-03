export const FILE_TYPES = [
  'trace',
  'screenshot',
  'video',
  'attachment',
] as const;
export type FileType = (typeof FILE_TYPES)[number];

/**
 * A file ready to upload. A trace folder is packed into a zip before it gets
 * here, so every entry is one file on disk.
 */
export type LocalFile = {
  path: string;
  name: string;
  type: FileType;
  contentType: string;
  sizeBytes: number;
};
