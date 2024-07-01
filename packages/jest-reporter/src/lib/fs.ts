import fs from "fs-extra";
import { join } from "path";
import { v4 as uuidv4 } from "uuid";
import { error } from "../logger";
import { debug } from "./debug";

export function generateUniqueDirName(baseName: string): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const uniqueId = uuidv4();
  return `${baseName}-${timestamp}-${uniqueId}`;
}

export async function createUniqueFolder(
  basePath: string,
  baseName: string
): Promise<string> {
  const uniqueDirName = generateUniqueDirName(baseName);
  const folderPath = join(basePath, uniqueDirName);

  return createFolder(folderPath);
}

export async function createFolder(folderPath: string) {
  try {
    await fs.ensureDir(folderPath);
    debug("Folder created", folderPath);
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
    await fs.writeFile(filePath, content, "utf8");
    debug("File created", filePath);
    return filePath;
  } catch (err) {
    error(`Error writing file at ${filePath}:`, err);
    throw err;
  }
}
