import fs from 'fs-extra';
import { join } from 'path';
import { randomUUID } from 'crypto';
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
    await fs.ensureDir(folderPath);
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
