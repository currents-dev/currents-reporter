import fs from 'fs';
import path from 'path';
import { globPaths } from '@lib/glob';
import { warn } from './lib';

export const getLastRunFilePaths = async (outputPath?: string) => {
  const prefix = path.resolve(outputPath ?? './test-results');

  const patterns = [
    path.posix.join(prefix.replace(/\\/g, '/'), '**/.last-run.json'),
    path.posix.join(prefix.replace(/\\/g, '/'), '.last-run.json'),
  ];

  return globPaths(patterns);
};

export const getUploadPaths = async (pathPatterns: string[] = []) => {
  const insidePaths = filterPaths(pathPatterns);
  if (insidePaths.length === 0) {
    return [];
  }
  return globPaths(insidePaths.map((p) => p.replace(/\\/g, '/')));
};

/** Keeps the paths inside the current folder, with a warning for the others. */
export function filterPaths(filePaths: string[]) {
  const baseDir = process.cwd();
  return filePaths.filter((filePath) => {
    const relativePath = path.relative(baseDir, path.resolve(filePath));
    const isOutside =
      relativePath === '..' ||
      relativePath.startsWith(`..${path.sep}`) ||
      path.isAbsolute(relativePath);

    if (isOutside) {
      warn(
        null,
        `Invalid path: "${filePath}". Path traversal detected. The path was skipped.`
      );
      return false;
    }

    return true;
  });
}

type LastRun = { status?: string; failedTests?: string[] };

/**
 * Whether `--last-failed` can rerun what the restored `.last-run.json` files
 * saved. Playwright saves a run that failed before it began (a shard that
 * could not plan its tests, a config error) as failed with no tests, and
 * `--last-failed` then runs no test and passes, so that shard has to run its
 * share again. An unreadable file counts the same.
 */
export async function canRerunLastFailed(restoredFiles: string[]) {
  const lastRunFiles = restoredFiles.filter(
    (file) => path.basename(file) === '.last-run.json'
  );
  if (lastRunFiles.length === 0) {
    return false;
  }
  for (const file of lastRunFiles) {
    const lastRun = await readLastRun(file);
    if (
      !lastRun ||
      (lastRun.status !== 'passed' && !lastRun.failedTests?.length)
    ) {
      return false;
    }
  }
  return true;
}

async function readLastRun(file: string): Promise<LastRun | null> {
  try {
    return JSON.parse(await fs.promises.readFile(file, 'utf8'));
  } catch {
    return null;
  }
}
