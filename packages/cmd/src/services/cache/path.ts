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
  const filteredPaths = filterPaths(pathPatterns);

  const uploadPaths: string[] = [];

  if (filteredPaths.length > 0) {
    uploadPaths.push(...globby.sync(pathPatterns));
  }
  return uploadPaths;
};

export function filterPaths(filePaths: string[]) {
  const baseDir = process.cwd();
  return filePaths.filter((filePath) => {
    const absolutePath = path.resolve(filePath);
    const relativePath = path.relative(baseDir, absolutePath);

    if (filePath.startsWith('..') || path.isAbsolute(relativePath)) {
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
