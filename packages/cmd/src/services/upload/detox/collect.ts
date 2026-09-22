import { debug as _debug } from '@debug';
import { copyFileAsync, createFolder, generateShortHash } from '@lib';
import fs from 'fs-extra';
import { extname, join } from 'path';
import { Artifact, InstanceReport } from '../../../types';
import { DetoxManifest, DetoxManifestTest } from './manifest';
import { getTestArtifactsDir } from './paths';

const debug = _debug.extend('detox');

const ARTIFACTS_DIR = 'artifacts';

const ARTIFACT_BY_EXTENSION: Record<
  string,
  Pick<Artifact, 'type' | 'contentType'>
> = {
  '.mp4': { type: 'video', contentType: 'video/mp4' },
  '.png': { type: 'screenshot', contentType: 'image/png' },
  '.jpg': { type: 'screenshot', contentType: 'image/jpeg' },
  '.log': { type: 'attachment', contentType: 'text/plain' },
  '.txt': { type: 'attachment', contentType: 'text/plain' },
  '.json': { type: 'attachment', contentType: 'application/json' },
  '.viewhierarchy': { type: 'attachment', contentType: 'application/xml' },
};

type AttachParams = {
  instances: InstanceReport[];
  reportDir: string;
  manifest: DetoxManifest;
};

/**
 * Detox writes the screenshots, videos and device logs of every test into a
 * directory named after the test, and closes the files only after the test
 * runner process exits - hence collecting them here rather than in the reporter.
 */
export async function attachDetoxArtifacts({
  instances,
  reportDir,
  manifest,
}: AttachParams): Promise<number> {
  const manifestByTestId = new Map(
    manifest.tests.map((test) => [test.testId, test])
  );
  const artifactsDir = await createFolder(join(reportDir, ARTIFACTS_DIR));
  let attached = 0;

  for (const instance of instances) {
    for (const test of instance.results.tests) {
      const manifestTest = manifestByTestId.get(test.testId);

      if (!manifestTest) {
        debug('No Detox manifest entry for %s', test.testId);
        continue;
      }

      for (const attempt of test.attempts) {
        const artifacts = await getAttemptArtifacts({
          manifestTest,
          attemptNumber: attempt.attempt,
          rootDir: manifest.artifactsRootDir,
          artifactsDir,
        });

        if (!artifacts.length) {
          continue;
        }

        attempt.artifacts = [...(attempt.artifacts ?? []), ...artifacts];
        attached += artifacts.length;
      }
    }
  }

  return attached;
}

async function getAttemptArtifacts({
  manifestTest,
  attemptNumber,
  rootDir,
  artifactsDir,
}: {
  manifestTest: DetoxManifestTest;
  attemptNumber: number;
  rootDir: string;
  artifactsDir: string;
}): Promise<Artifact[]> {
  const manifestAttempt = manifestTest.attempts.find(
    (a) => a.attempt === attemptNumber
  );

  if (!manifestAttempt) {
    return [];
  }

  const testDir = getTestArtifactsDir({
    rootDir,
    fullName: manifestTest.fullName,
    status: manifestAttempt.status,
    invocations: manifestAttempt.invocations,
  });

  let fileNames: string[] = [];
  try {
    fileNames = (await fs.readdir(testDir)).sort();
  } catch {
    debug('No Detox artifacts at %s', testDir);
    return [];
  }

  const artifacts: Artifact[] = [];

  for (const fileName of fileNames) {
    const artifactType = ARTIFACT_BY_EXTENSION[extname(fileName)];

    if (!artifactType) {
      debug('Skipping unsupported Detox artifact %s', fileName);
      continue;
    }

    const sourcePath = join(testDir, fileName);
    const targetName = `${generateShortHash(sourcePath)}${extname(fileName)}`;
    await copyFileAsync(sourcePath, join(artifactsDir, targetName));

    artifacts.push({
      ...artifactType,
      path: join(ARTIFACTS_DIR, targetName),
      name: fileName,
    });
  }

  return artifacts;
}
