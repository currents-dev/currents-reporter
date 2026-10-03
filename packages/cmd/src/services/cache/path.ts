import path from 'path';
import * as globby from 'globby';
import { MetaFile, warn } from './lib';

export const getLastRunFilePaths = async (outputPath?: string) => {
  const prefix = path.resolve(outputPath ?? './test-results');

  const patterns = [
    path.posix.join(prefix.replace(/\\/g, '/'), '**/.last-run.json'),
    path.posix.join(prefix.replace(/\\/g, '/'), '.last-run.json'),
  ];

  return globby.sync(patterns);
};

export const getUploadPaths = async (pathPatterns: string[] = []) => {
  const insidePaths = filterPaths(pathPatterns);
  if (insidePaths.length === 0) {
    return [];
  }
  return globby.sync(insidePaths.map((p) => p.replace(/\\/g, '/')));
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

export function wasLastRunFileUploaded(meta: MetaFile | null): boolean {
  return meta
    ? meta.path.some((p) => path.basename(p) === '.last-run.json')
    : false;
}
