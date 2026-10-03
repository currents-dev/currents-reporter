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
 * A `.env` file holds secrets, and what is attached ends up on a page anyone
 * with the link can open.
 */
function assertNotSecretsFile(name: string) {
  if (/^\.env($|\.)/i.test(name)) {
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
 * The files directly in a folder. Hidden files and links are left out, with a
 * warning: a folder passed on purpose is not a reason to publish what happens
 * to sit in it.
 */
async function toLocalFilesInFolder(
  folder: string,
  options: CollectOptions,
  packedFolder?: string
) {
  const files: LocalFile[] = [];
  for (const entry of await fs.readdir(folder, { withFileTypes: true })) {
    const entryPath = path.join(folder, entry.name);
    if (entry.name.startsWith('.')) {
      warn(`Skipping the hidden file "${entryPath}"`);
    } else if (entry.isSymbolicLink()) {
      warn(`Skipping the link "${entryPath}"`);
    } else if (entry.isDirectory()) {
      if (entryPath === packedFolder) continue;
      warn(`Skipping the folder "${entryPath}"`);
    } else if (entry.isFile()) {
      if ((await fs.stat(entryPath)).size === 0) {
        warn(`Skipping the empty file "${entryPath}"`);
        continue;
      }
      files.push(await toLocalFile(entryPath, entry.name, options));
    }
  }
  return files;
}

/**
 * Expands files and folders into the files to upload. A folder gives each file
 * directly in it. A folder holding Playwright MCP `trace-*.trace` files, or a
 * `traces` folder that does (the MCP output folder), gives one packed trace zip.
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

  const addPackedTrace = async (traceFolder: string) => {
    const packed = await packTraceFolder(traceFolder);
    cleanups.push(packed.cleanup);
    // The API refuses two traces with one name on an attempt, so a retried
    // attach needs a name of its own.
    files.push(
      await toLocalFile(packed.zipPath, `trace-${getNanoid(8)}.zip`, {
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

      const tracesFolder = path.join(input, 'traces');
      let packedFolder: string | undefined;
      if (
        (await fs.pathExists(tracesFolder)) &&
        (await isTraceFolder(tracesFolder))
      ) {
        await addPackedTrace(tracesFolder);
        packedFolder = tracesFolder;
      }
      files.push(...(await toLocalFilesInFolder(input, options, packedFolder)));
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
