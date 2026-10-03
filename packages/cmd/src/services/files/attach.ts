import { debug as _debug } from '@debug';
import { error, info, warn } from '@logger';
import {
  ApiCredentials,
  AttachmentOwner,
  createAttachments,
  RunAttachmentTarget,
} from '../../api';
import { collectFiles } from './collect';
import { isFileType } from './detect';
import { ALLOWED_TYPES, getFileLevel, SESSION_ALLOWED_TYPES } from './levels';
import { FileType, LocalFile } from './types';
import { UploadOutcome, uploadFiles } from './upload';

const debug = _debug.extend('files');

type SessionOwner = Extract<AttachmentOwner, { sessionId: string }>;

export type AttachParams = (
  | { owner: SessionOwner; target?: never }
  | {
      owner: Exclude<AttachmentOwner, SessionOwner>;
      /** Where the attachments go on the run. */
      target?: RunAttachmentTarget;
    }
) & {
  credentials: ApiCredentials;
  paths: string[];
  type?: string;
  caption?: string;
  meta?: string[];
};

/** `--meta k=v`, repeated. */
export function parseMeta(entries: string[] = []) {
  // A Map, so that a key such as `__proto__` stays an ordinary key.
  const meta = new Map<string, string>();
  for (const entry of entries) {
    const at = entry.indexOf('=');
    if (at < 1) {
      throw new Error(`--meta expects key=value, got "${entry}"`);
    }
    const key = entry.slice(0, at);
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(key)) {
      throw new Error(
        `--meta key "${key}" can only hold up to 64 letters, digits, "_" and "-"`
      );
    }
    const value = entry.slice(at + 1);
    if (value.length > 256) {
      throw new Error(`--meta value of "${key}" is longer than 256 characters`);
    }
    meta.set(key, value);
  }
  return meta.size > 0 ? Object.fromEntries(meta) : undefined;
}

export function parseFileType(type?: string): FileType | undefined {
  if (type === undefined) return undefined;
  if (!isFileType(type)) {
    throw new Error(
      `--type must be one of trace, screenshot, video, attachment, got "${type}"`
    );
  }
  return type;
}

/** What the API takes in one files request. */
const MAX_FILES_PER_REQUEST = 50;

/**
 * Signed upload URLs last 10 minutes, and storage checks that when a PUT
 * starts. Files of one request are uploaded after it, so a request declares
 * only what a slow runner (256 KiB/s) sends in about 7 minutes. A larger file
 * gets a request of its own and starts at once.
 */
export const MAX_BYTES_PER_REQUEST = 100 * 1024 ** 2;

/** The most files an instance takes through the API. */
const MAX_FILES_PER_INSTANCE = 200;

export function chunkFiles(
  files: LocalFile[],
  limits = { count: MAX_FILES_PER_REQUEST, bytes: MAX_BYTES_PER_REQUEST }
) {
  const chunks: LocalFile[][] = [];
  let bytes = 0;
  for (const file of files) {
    const current = chunks[chunks.length - 1];
    if (
      !current ||
      current.length >= limits.count ||
      bytes + file.sizeBytes > limits.bytes
    ) {
      chunks.push([file]);
      bytes = file.sizeBytes;
    } else {
      current.push(file);
      bytes += file.sizeBytes;
    }
  }
  return chunks;
}

/**
 * Declares the files to the API in chunks, uploading each chunk right after it
 * is declared, and says for every file whether it arrived.
 */
export async function attachFiles(params: AttachParams) {
  if (!params.credentials.apiKey && !params.credentials.recordKey) {
    throw new Error('Pass an API key or a record key');
  }
  const type = parseFileType(params.type);
  const meta = parseMeta(params.meta);
  const target = params.target ?? {};
  const allowedTypes =
    'sessionId' in params.owner
      ? SESSION_ALLOWED_TYPES
      : ALLOWED_TYPES[getFileLevel(target)];
  const { files, cleanup } = await collectFiles(params.paths, {
    type,
    allowedTypes,
  });

  if (files.length > MAX_FILES_PER_INSTANCE) {
    warn(
      `Attaching ${files.length} files. An instance takes up to ${MAX_FILES_PER_INSTANCE} files through the API, so the rest may be refused`
    );
  }

  const attached: LocalFile[] = [];
  const failed: UploadOutcome[] = [];
  try {
    for (const chunk of chunkFiles(files)) {
      const declarations = chunk.map((file) => ({
        name: file.name,
        type: file.type,
        contentType: file.contentType,
        sizeBytes: file.sizeBytes,
        caption: params.caption,
        meta,
      }));
      let created;
      try {
        created = await createAttachments(
          params.credentials,
          params.owner,
          target,
          declarations
        );
      } catch (e) {
        throw new Error(
          `${(e as Error).message}\n${attached.length} of ${files.length} files were attached before this`
        );
      }
      debug(
        'Created %d attachments at level %s',
        created.attachments.length,
        created.level ?? 'session'
      );

      if (created.attachments.length !== chunk.length) {
        throw new Error(
          `The API returned ${created.attachments.length} upload URLs for ${chunk.length} files`
        );
      }
      const outcomes = await uploadFiles(
        chunk.map((file, i) => {
          if (created.attachments[i].name !== file.name) {
            throw new Error(
              `The API answered "${created.attachments[i].name}" where "${file.name}" was declared`
            );
          }
          const { uploadUrl, uploadHeaders } = created.attachments[i];
          return { file, uploadUrl, uploadHeaders };
        })
      );
      for (const outcome of outcomes) {
        if (outcome.error) {
          error('Failed %s: %s', outcome.file.name, outcome.error.message);
          failed.push(outcome);
        } else {
          info('Attached %s (%s)', outcome.file.name, outcome.file.type);
          attached.push(outcome.file);
        }
      }
    }
  } finally {
    // Temporary trace zips; failing to remove them must not hide the result.
    await cleanup().catch((e: Error) =>
      warn('Could not remove temporary files: %s', e.message)
    );
  }

  if (failed.length > 0) {
    throw new Error(
      `${failed.length} of ${files.length} files could not be uploaded`
    );
  }
  // Without the local path: a packed trace's temporary zip is gone by now.
  return {
    files: attached.map(({ name, type, sizeBytes }) => ({
      name,
      type,
      sizeBytes,
    })),
  };
}
