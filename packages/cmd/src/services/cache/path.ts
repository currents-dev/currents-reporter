import path from 'path';

import { glob } from 'glob';
import { warn } from './lib';

export const getLastRunFilePaths = async (outputPath?: string) => {
  const prefix = path.resolve(outputPath ?? './test-results');

  const patterns = [
    path.resolve(prefix, '**/.last-run.json'),
    path.resolve(prefix, '.last-run.json'),
  ];

  return glob(patterns);
};

export const getUploadPaths = async (pathPatterns: string[] = []) => {
  const filteredPaths = filterPaths(pathPatterns);

  const uploadPaths: string[] = [];

  if (filteredPaths.length > 0) {
    uploadPaths.push(...(await glob(pathPatterns)));
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
