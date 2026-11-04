import { randomUUID } from 'crypto';
import fs from 'fs/promises';
import { join } from 'path';
import { error } from '../logger';
import { debug } from './debug';

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

export async function writeFileAsync(
  basePath: string,
  fileName: string,
  content: string
) {
  const filePath = join(basePath, fileName);

  try {
    await fs.writeFile(filePath, content, 'utf8');
    debug('File created', filePath);
    return filePath;
  } catch (err) {
    error(`Error writing file at ${filePath}:`, err);
    throw err;
  }
}

/** Like fs-extra's readJson: drops a byte order mark before parsing. */
export async function readJson(filePath: string) {
  const text = await fs.readFile(filePath, 'utf8');
  return JSON.parse(text.replace(/^\uFEFF/, ''));
}

export async function readInstanceReport<T>(
  filePath: string
): Promise<T | undefined> {
  try {
    return await readJson(filePath);
  } catch {
    debug('No previous report at %s', filePath);
    return undefined;
  }
}
