import { error } from '@logger';
import { randomUUID } from 'crypto';
import { existsSync } from 'fs';
import fs from 'fs/promises';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { debug } from '../debug';
import { createLimit } from './limit';

/**
 * For file operations that run once per report, test or artifact, so that
 * thousands of files don't fail with EMFILE. A task must not call
 * limitOpenFiles itself: it would wait for a slot that it holds.
 */
export const limitOpenFiles = createLimit(32);

/**
 * Like fs-extra's readJson: drops a byte order mark, and a parse error starts
 * with the file path.
 */
export async function readJson(filePath: string): Promise<any> {
  const text = await fs.readFile(filePath, 'utf8');
  try {
    return JSON.parse(text.replace(/^\uFEFF/, ''));
  } catch (err) {
    (err as Error).message = `${filePath}: ${(err as Error).message}`;
    throw err;
  }
}

export function pathExists(filePath: string) {
  return fs.access(filePath).then(
    () => true,
    () => false
  );
}

export async function readJsonFile<T>(filePath: string): Promise<T> {
  try {
    const data = await readJson(filePath);
    return data as T;
  } catch (err) {
    error('Error while reading JSON file: %s', filePath, err);
    throw error;
  }
}

export async function writeFileAsync(filePath: string, content: string) {
  try {
    await fs.writeFile(filePath, content, 'utf8');
    return filePath;
  } catch (err) {
    error(`Error writing file at ${filePath}:`, err);
    throw err;
  }
}

export async function writeFileAsyncIfNotExists(
  filePath: string,
  content: string
) {
  try {
    try {
      await fs.access(filePath);
      return filePath;
    } catch {
      await fs.writeFile(filePath, content, 'utf8');
      return filePath;
    }
  } catch (err) {
    error(`Error writing file at ${filePath}:`, err);
    throw err;
  }
}

export async function ensurePathExists(
  filePath: string,
  isDirectory?: boolean
): Promise<void> {
  if (isDirectory) {
    await fs.mkdir(filePath, { recursive: true });
    return;
  }

  const dir = dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
}

/** Creates an empty file, readable only by the owner, in the OS temp folder. */
export async function createTempFile(suffix = '') {
  const filePath = join(tmpdir(), `currents-${randomUUID()}${suffix}`);
  await fs.writeFile(filePath, '', { flag: 'wx', mode: 0o600 });
  return filePath;
}

export function generateUniqueDirName(): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const uniqueId = randomUUID();
  return `${timestamp}-${uniqueId}`;
}

export async function createUniqueFolder(
  basePath: string,
  baseName: string
): Promise<string> {
  const uniqueDirName = generateUniqueDirName();
  const folderPath = join(basePath, baseName, uniqueDirName);

  return createFolder(folderPath);
}

export async function createFolder(folderPath: string) {
  try {
    await fs.mkdir(folderPath, { recursive: true });
    debug('Folder created', folderPath);
    return folderPath;
  } catch (err) {
    error(`Failed to create folder at ${folderPath}:`, err);
    throw err;
  }
}

export async function copyFileAsync(
  srcPath: string,
  destPath: string
): Promise<string> {
  try {
    await fs.mkdir(dirname(destPath), { recursive: true });
    await fs.cp(srcPath, destPath, { recursive: true, verbatimSymlinks: true });
    debug('File copied from %s to %s', srcPath, destPath);
    return destPath;
  } catch (err) {
    error(`Failed to copy file from ${srcPath} to ${destPath}:`, err);
    throw err;
  }
}

/**
 * Returns the first of `from` and its parent folders that holds `name`, a
 * file or folder path relative to that folder.
 */
export function findUp(name: string, from: string) {
  let dir = from;
  while (!existsSync(join(dir, name))) {
    const parent = dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
  return dir;
}
