import fs from "fs-extra";
import path from "path";
import { ReportOptions } from "../types";
import { error } from "../logger";

export async function resolveReportOptions(
  options?: ReportOptions
): Promise<Required<ReportOptions>> {
  const reportDir = await findReportDir(options?.reportDir);

  if (!reportDir) {
    throw new Error("Failed to find the report dir");
  }

  return {
    reportDir,
    configFilePath:
      options?.configFilePath ?? path.join(reportDir, "config.json"),
  };
}

async function findReportDir(reportDir?: string): Promise<string | null> {
  if (reportDir) {
    await checkPathExists(reportDir);
    return reportDir;
  }

  return getLastCreatedDirectory(process.cwd(), ".currents-report");
}

async function getLastCreatedDirectory(
  dir: string,
  prefix: string
): Promise<string | null> {
  const entries = await fs.readdir(dir);
  let latestDir: { name: string; birthtime: Date } | null = null;

  for (const entry of entries) {
    const entryPath = path.join(dir, entry);
    const stat = await fs.stat(entryPath);

    if (stat.isDirectory() && entry.startsWith(prefix)) {
      if (!latestDir || stat.birthtime > latestDir.birthtime) {
        latestDir = { name: entry, birthtime: stat.birthtime };
      }
    }
  }

  return latestDir ? latestDir.name : null;
}

export async function checkPathExists(path: string): Promise<boolean> {
  try {
    const exists = await fs.pathExists(path);
    return exists;
  } catch (err) {
    error("Error checking if path exists:", error);
    return false;
  }
}

export async function getInstanceReportList(reportDir: string) {
  const instancesDir = path.join(reportDir, "instances");
  return getAllFilePaths(instancesDir);
}

async function getAllFilePaths(dir: string): Promise<string[]> {
  const files = await fs.readdir(dir);
  const filePaths: string[] = [];

  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = await fs.stat(filePath);

    if (stat.isFile()) {
      filePaths.push(filePath);
    }
  }

  return filePaths;
}

export async function readJsonFile<T>(filePath: string): Promise<T> {
  try {
    const data = await fs.readJson(filePath);
    return data as T;
  } catch (err) {
    error("Error while reading JSON file: %s", filePath, err);
    throw error;
  }
}

export async function writeFileAsync(
  filePath: string,
  content: string
) {
  try {
    await fs.writeFile(filePath, content, "utf8");
    return filePath;
  } catch (err) {
    error(`Error writing file at ${filePath}:`, err);
    throw err;
  }
}
