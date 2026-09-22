import { debug as _debug } from '@debug';
import { copyFileAsync, createFolder, generateShortHash } from '@lib';
import fs from 'fs-extra';
import { extname, join } from 'path';
import { Artifact, InstanceReport, InstanceReportTest } from '../../../types';
import { DetoxManifest, DetoxManifestTest, inExecutionOrder } from './manifest';
import { MAX_INVOCATION_PROBE, getTestArtifactsDir } from './paths';
import { TraceTestSlice, readDetoxTrace } from './trace';

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

export type AttachResult = {
  artifacts: number;
  steps: number;
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
}: AttachParams): Promise<AttachResult> {
  const manifestByTestId = getManifestByTestId(manifest);
  const traceByFullName = await readDetoxTrace(manifest.artifactsRootDir);
  const artifactsDir = await createFolder(join(reportDir, ARTIFACTS_DIR));
  const result: AttachResult = { artifacts: 0, steps: 0 };

  for (const instance of instances) {
    for (const test of instance.results.tests) {
      const manifestTest = manifestByTestId.get(test.testId);

      if (!manifestTest) {
        debug('No Detox manifest entry for %s', test.testId);
        continue;
      }

      await attachTest({
        test,
        manifestTest,
        rootDir: manifest.artifactsRootDir,
        artifactsDir,
        traceSlices: traceByFullName.get(manifestTest.fullName) ?? [],
        result,
      });
    }
  }

  return result;
}

/**
 * Detox names an artifact directory after the test's full name alone, so the
 * artifacts of tests sharing one cannot be told apart and are left out rather
 * than attached to the wrong test.
 */
function getManifestByTestId(manifest: DetoxManifest) {
  const testIdsByFullName = new Map<string, string[]>();

  manifest.tests.forEach((test) => {
    testIdsByFullName.set(test.fullName, [
      ...(testIdsByFullName.get(test.fullName) ?? []),
      test.testId,
    ]);
  });

  return new Map(
    manifest.tests
      .filter((test) => {
        const isUnique = testIdsByFullName.get(test.fullName)?.length === 1;

        if (!isUnique) {
          debug('Ambiguous Detox test name, skipping: %s', test.fullName);
        }

        return isUnique;
      })
      .map((test) => [test.testId, test])
  );
}

async function attachTest({
  test,
  manifestTest,
  rootDir,
  artifactsDir,
  traceSlices,
  result,
}: {
  test: InstanceReportTest;
  manifestTest: DetoxManifestTest;
  rootDir: string;
  artifactsDir: string;
  traceSlices: TraceTestSlice[];
  result: AttachResult;
}) {
  // Every Detox rerun reports its attempts as attempt 0, and the reporter
  // renumbers them while merging the reruns of a spec, so manifest attempts are
  // matched to reported ones by execution order rather than by number.
  const reportedAttempts = [...test.attempts].sort(
    (a, b) => a.attempt - b.attempt
  );
  const manifestAttempts = inExecutionOrder(manifestTest.attempts);
  let invocation = 1;

  for (const [index, manifestAttempt] of manifestAttempts.entries()) {
    const attempt = reportedAttempts[index];

    if (!attempt) {
      debug('No reported attempt %d of %s', index, manifestTest.fullName);
      continue;
    }

    const found = await findAttemptArtifacts({
      fullName: manifestTest.fullName,
      status: manifestAttempt.status,
      rootDir,
      artifactsDir,
      fromInvocation: invocation,
    });

    if (found) {
      invocation = found.invocation + 1;
      attempt.artifacts = [...(attempt.artifacts ?? []), ...found.artifacts];
      result.artifacts += found.artifacts.length;
    }

    const steps = getAttemptSteps(traceSlices, index, found?.invocation);
    if (steps.length) {
      attempt.steps = [...(attempt.steps ?? []), ...steps];
      result.steps += steps.length;
    }
  }
}

async function findAttemptArtifacts({
  fullName,
  status,
  rootDir,
  artifactsDir,
  fromInvocation,
}: {
  fullName: string;
  status: string;
  rootDir: string;
  artifactsDir: string;
  fromInvocation: number;
}) {
  for (
    let invocation = fromInvocation;
    invocation < fromInvocation + MAX_INVOCATION_PROBE;
    invocation++
  ) {
    const testDir = getTestArtifactsDir({
      rootDir,
      fullName,
      status,
      invocations: invocation,
    });

    const fileNames = await readArtifactDir(testDir);
    if (!fileNames) {
      continue;
    }

    return {
      invocation,
      artifacts: await copyArtifacts(testDir, fileNames, artifactsDir),
    };
  }

  debug('No Detox artifacts for %s [%s]', fullName, status);
  return undefined;
}

async function readArtifactDir(testDir: string) {
  try {
    return (await fs.readdir(testDir)).sort();
  } catch {
    return undefined;
  }
}

async function copyArtifacts(
  testDir: string,
  fileNames: string[],
  artifactsDir: string
): Promise<Artifact[]> {
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

/**
 * The trace records Detox's own invocation number, so it is matched to the
 * number the artifact directory was found under, and by execution order when
 * no artifacts were recorded.
 */
function getAttemptSteps(
  traceSlices: TraceTestSlice[],
  index: number,
  invocation?: number
) {
  const byInvocation =
    invocation === undefined
      ? undefined
      : traceSlices.find((slice) => slice.invocations === invocation);
  const slice =
    byInvocation ??
    [...traceSlices].sort((a, b) => a.invocations - b.invocations)[index];

  return slice?.steps ?? [];
}
