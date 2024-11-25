import { error } from '@logger';
import fs from 'fs-extra';
import { dirname, join } from 'path';
import { v4 as uuidv4 } from 'uuid';
import { debug } from '../debug';

export async function readJsonFile<T>(filePath: string): Promise<T> {
  try {
    const data = await fs.readJson(filePath);
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

export async function ensurePathExists(
  filePath: string,
  isDirectory?: boolean
): Promise<void> {
  if (isDirectory) {
    await fs.ensureDir(filePath);
    return;
  }

  const dir = dirname(filePath);
  await fs.ensureDir(dir);
}

export function generateUniqueDirName(): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const uniqueId = uuidv4();
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
