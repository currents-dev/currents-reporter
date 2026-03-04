import { debug } from '@debug';
import { copyFileAsync, generateShortHash } from '@lib';
import { extname, isAbsolute, join, relative, resolve } from 'path';
import { Artifact } from '../../types';

export const processArtifacts = async (
  artifacts: Artifact[] | undefined,
  hashKey: string,
  artifactsDir: string,
  workspaceRoot: string
) => {
  if (!artifacts) return;

  for (const artifact of artifacts) {
    try {
      const resolvedPath = resolve(workspaceRoot, artifact.path);
      const relativePath = relative(workspaceRoot, resolvedPath);

      if (relativePath.startsWith('..') || isAbsolute(relativePath)) {
        debug(
          'Skipping artifact outside workspace: %s (resolved: %s)',
          artifact.path,
          resolvedPath
        );
        continue;
      }

      const fileName = `${generateShortHash(
        hashKey + artifact.path
      )}.${extname(artifact.path).slice(1) || 'bin'}`;
      await copyFileAsync(resolvedPath, join(artifactsDir, fileName));
      // Update path to relative path in artifacts folder
      artifact.path = join('artifacts', fileName);
    } catch (e) {
      debug('Failed to copy artifact %s: %o', artifact.path, e);
    }
  }
};
