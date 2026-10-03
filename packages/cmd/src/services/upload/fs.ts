import { error } from '@logger';
import fs from 'fs-extra';
import path, { join, resolve } from 'path';
import { ReportOptions } from './types';

export async function resolveReportOptions(
  options?: ReportOptions
): Promise<Required<ReportOptions>> {
  const reportDir = await findReportDir(options?.reportDir);

  return {
    reportDir,
    configFilePath:
      options?.configFilePath ?? path.join(reportDir, 'config.json'),
  };
}

async function findReportDir(reportDir?: string): Promise<string> {
  if (reportDir) {
    if (!(await fs.pathExists(reportDir))) {
      throw new Error(
        `No reports found: the folder "${reportDir}" does not exist.`
      );
    }
    return reportDir;
  }

  const defaultDir = join(process.cwd(), '.currents');
  const latestDir = (await fs.pathExists(defaultDir))
    ? await getLastCreatedDirectory(defaultDir)
    : null;
  if (!latestDir) {
    throw new Error(
      `No reports found: there is no report folder in "${defaultDir}". Run the tests with a Currents reporter first, or pass --report-dir with the folder of the reports.`
    );
  }
  return latestDir;
}

async function getLastCreatedDirectory(dir: string): Promise<string | null> {
  const entries = await fs.readdir(dir);
  let latestDir: { name: string; birthtime: Date } | null = null;

  for (const entry of entries) {
    const entryPath = path.join(dir, entry);
    const stat = await fs.stat(entryPath);

    if (stat.isDirectory()) {
      if (!latestDir || stat.birthtime > latestDir.birthtime) {
        latestDir = { name: entry, birthtime: stat.birthtime };
      }
    }
  }

  return latestDir ? resolve(dir, latestDir.name) : null;
}

export async function checkPathExists(path: string): Promise<boolean> {
  try {
    const exists = await fs.pathExists(path);
    return exists;
  } catch (err) {
    error('Error checking if path exists:', error);
    return false;
  }
}

export async function getInstanceReportList(reportDir: string) {
  const instancesDir = path.join(reportDir, 'instances');
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
