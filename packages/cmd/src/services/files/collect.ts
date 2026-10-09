import fs from 'fs-extra';
import path from 'path';
import { getNanoid } from '../../lib/nano';
import { warn } from '../../logger';
import {
  assertTypeAllowed,
  assertTypeMatchesFile,
  getContentType,
  getFileType,
} from './detect';
import { isTraceFolder, isTraceZip, packTraceFolder } from './packTrace';
import { FileType, LocalFile } from './types';

/** The most the API takes for one file. */
const MAX_FILE_BYTES = 1024 ** 3;

export type CollectOptions = {
  /** Forces the type of every file. */
  type?: FileType;
  /** What the target takes; a file of any other kind becomes an attachment. */
  allowedTypes: readonly FileType[];
};

export type CollectedFiles = {
  files: LocalFile[];
  /** Removes the zips packed from trace folders. */
  cleanup: () => Promise<void>;
};

/**
 * Environment files hold secrets, and what is attached ends up on a page
 * anyone with the link can open: `.env`, `.env.local`, `.env-prod`,
 * `.env_local`, `.envrc`, `prod.env`.
 */
const ENV_FILE = /^\.env($|[._-])|^\.envrc$|\.env$/i;

/** Keys and certificates, left out when they only sit in a folder passed in. */
const KEY_FILE = /\.(pem|key)$|^id_(rsa|ed25519|ecdsa|dsa)/i;

function assertNotSecretsFile(name: string) {
  if (ENV_FILE.test(name)) {
    throw new Error(
      `"${name}" looks like an environment file with secrets and is not attached`
    );
  }
}

async function toLocalFile(
  filePath: string,
  name: string,
  options: CollectOptions
): Promise<LocalFile> {
  assertNotSecretsFile(name);
  let type = options.type ?? getFileType(name, options.allowedTypes);
  if (options.type) {
    assertTypeMatchesFile(name, options.type);
    assertTypeAllowed(name, options.type, options.allowedTypes);
  } else if (type === 'trace' && !(await isTraceZip(filePath))) {
    type = 'attachment';
  }
  const stats = await fs.stat(filePath);
  if (stats.size > MAX_FILE_BYTES) {
    throw new Error(`"${name}" is larger than 1 GiB`);
  }
  if (stats.size === 0) {
    throw new Error(`"${name}" is empty`);
  }
  return {
    path: filePath,
    name,
    type,
    contentType: getContentType(name),
    sizeBytes: stats.size,
  };
}

/**
 * The files in a folder and its subfolders, named by their path from the
 * folder, such as `login-chromium/trace.zip`: Playwright Test writes one
 * subfolder per test, each with the same file names. Hidden files and folders,
 * links, and key and secrets files are left out, with a warning: a folder
 * passed on purpose is not a reason to publish what happens to sit in it.
 * A subfolder holding Playwright MCP `trace-*.trace` files goes to
 * `addPackedTrace` instead of being walked.
 */
async function toLocalFilesInFolder(
  root: string,
  options: CollectOptions,
  addPackedTrace: (traceFolder: string, namePrefix: string) => Promise<void>
) {
  const files: LocalFile[] = [];
  const walk = async (folder: string) => {
    for (const entry of await fs.readdir(folder, { withFileTypes: true })) {
      const entryPath = path.join(folder, entry.name);
      const name = path.relative(root, entryPath).split(path.sep).join('/');
      if (entry.name.startsWith('.')) {
        warn(`Skipping the hidden file "${entryPath}"`);
      } else if (KEY_FILE.test(entry.name) || ENV_FILE.test(entry.name)) {
        warn(`Skipping "${entryPath}", which looks like a key or secrets file`);
      } else if (entry.isSymbolicLink()) {
        warn(`Skipping the link "${entryPath}"`);
      } else if (entry.isDirectory()) {
        if (await isTraceFolder(entryPath)) {
          await addPackedTrace(entryPath, path.posix.dirname(name));
        } else {
          await walk(entryPath);
        }
      } else if (entry.isFile()) {
        if ((await fs.stat(entryPath)).size === 0) {
          warn(`Skipping the empty file "${entryPath}"`);
          continue;
        }
        files.push(await toLocalFile(entryPath, name, options));
      }
    }
  };
  await walk(root);
  return files;
}

/**
 * Expands files and folders into the files to upload. A folder gives every
 * file under it. A folder holding Playwright MCP `trace-*.trace` files gives
 * one packed trace zip, wherever it sits.
 */
export async function collectFiles(
  inputs: string[],
  options: CollectOptions
): Promise<CollectedFiles> {
  const files: LocalFile[] = [];
  const cleanups: Array<() => Promise<void>> = [];
  const cleanup = async () => {
    await Promise.all(cleanups.map((fn) => fn()));
  };

  const addPackedTrace = async (traceFolder: string, namePrefix = '.') => {
    const packed = await packTraceFolder(traceFolder);
    cleanups.push(packed.cleanup);
    // The API refuses two traces with one name on an attempt, so a retried
    // attach needs a name of its own.
    const name = path.posix.join(namePrefix, `trace-${getNanoid(8)}.zip`);
    files.push(
      await toLocalFile(packed.zipPath, name, {
        ...options,
        type: options.type ?? getFileType('trace.zip', options.allowedTypes),
      })
    );
  };

  try {
    for (const input of inputs) {
      const stats = await fs.stat(input).catch(() => null);
      if (!stats) throw new Error(`"${input}" does not exist`);

      if (!stats.isDirectory()) {
        files.push(await toLocalFile(input, path.basename(input), options));
        continue;
      }

      if (await isTraceFolder(input)) {
        await addPackedTrace(input);
        continue;
      }

      files.push(
        ...(await toLocalFilesInFolder(input, options, addPackedTrace))
      );
    }
  } catch (e) {
    await cleanup();
    throw e;
  }

  if (files.length === 0) {
    throw new Error('There are no files to attach');
  }
  return { files, cleanup };
}
