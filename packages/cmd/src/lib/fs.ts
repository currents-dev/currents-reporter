import { error } from "@logger";
import fs from "fs-extra";
import { dirname } from "path";

export async function readJsonFile<T>(filePath: string): Promise<T> {
  try {
    const data = await fs.readJson(filePath);
    return data as T;
  } catch (err) {
    error("Error while reading JSON file: %s", filePath, err);
    throw error;
  }
}

export async function writeFileAsync(filePath: string, content: string) {
  try {
    await fs.writeFile(filePath, content, "utf8");
    return filePath;
  } catch (err) {
    error(`Error writing file at ${filePath}:`, err);
    throw err;
  }
}

export async function ensurePathExists(filePath: string): Promise<void> {
  const dir = dirname(filePath);
  await fs.ensureDir(dir);
}
