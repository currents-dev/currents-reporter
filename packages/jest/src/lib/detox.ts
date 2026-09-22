import fs from 'fs-extra';
import { join } from 'path';
import { debug } from './debug';

export const DETOX_MANIFEST_FILE = 'detox.json';

export type DetoxSession = {
  artifactsRootDir: string;
  configuration?: string;
  version?: string;
  /**
   * Incremented by `detox test --retries` for every rerun. Detox keeps one
   * session - and one artifacts root - across the reruns, and continues its
   * artifact numbering, so the index tells apart the attempts of a test that
   * Jest itself reports as attempt 0 in every rerun.
   */
  testSessionIndex: number;
};

export type DetoxManifestAttempt = {
  attempt: number;
  /** The Detox rerun this attempt ran in, from DetoxSession.testSessionIndex. */
  session: number;
  /** Jest counts invocations from 1 and restarts at 1 in every Detox rerun. */
  invocations: number;
  status: string;
};

export type DetoxManifestTest = {
  testId: string;
  fullName: string;
  attempts: DetoxManifestAttempt[];
};

export type DetoxManifest = DetoxSession & {
  tests: DetoxManifestTest[];
};

/**
 * Detox resolves the artifacts root - the configuration name plus the session
 * timestamp - before it starts Jest and points the process at the resolved
 * session via DETOX_CONFIG_SNAPSHOT_PATH. Reading it here avoids resolving the
 * Detox config a second time, which would need a device.
 */
export async function getDetoxSession(): Promise<DetoxSession | undefined> {
  const sessionFilePath = process.env.DETOX_CONFIG_SNAPSHOT_PATH;
  if (!sessionFilePath) {
    return undefined;
  }

  try {
    const session = await fs.readJson(sessionFilePath);
    const artifactsRootDir = session?.detoxConfig?.artifacts?.rootDir;

    if (!artifactsRootDir) {
      debug('No artifacts root dir in %s', sessionFilePath);
      return undefined;
    }

    const detoxSession = {
      artifactsRootDir,
      configuration: session?.detoxConfig?.configurationName,
      version: getDetoxVersion(),
      testSessionIndex: getTestSessionIndex(session),
    };

    debug('Detox session: %o', detoxSession);
    return detoxSession;
  } catch (e) {
    debug('Failed to read the Detox session %s: %o', sessionFilePath, e);
    return undefined;
  }
}

/**
 * Detox hands the current rerun index to the Jest process over its IPC channel,
 * so detox/internals holds the live value while the session file keeps the one
 * it was serialized with.
 */
function getTestSessionIndex(session: { testSessionIndex?: number }): number {
  try {
    const internals = require('detox/internals');
    const index = internals?.session?.testSessionIndex;

    if (typeof index === 'number') {
      return index;
    }
  } catch {
    debug('detox/internals is not available');
  }

  return session?.testSessionIndex ?? 0;
}

function getDetoxVersion(): string | undefined {
  try {
    return require('detox/package.json').version;
  } catch {
    return undefined;
  }
}

/**
 * `detox test --retries` runs Jest again for the failed files only, so the
 * manifest of the previous run is merged instead of overwritten - the earlier
 * attempts keep their artifacts.
 */
export async function writeDetoxManifest(
  reportDir: string,
  session: DetoxSession,
  tests: DetoxManifestTest[]
) {
  const filePath = join(reportDir, DETOX_MANIFEST_FILE);
  const previous = await readDetoxManifest(filePath);
  const merged = new Map(
    (previous?.tests ?? []).map((test) => [test.testId, test])
  );

  tests.forEach((test) => {
    const existing = merged.get(test.testId);
    if (!existing) {
      merged.set(test.testId, test);
      return;
    }

    const attempts = new Map(
      existing.attempts.map((attempt) => [getAttemptKey(attempt), attempt])
    );
    test.attempts.forEach((attempt) =>
      attempts.set(getAttemptKey(attempt), attempt)
    );

    merged.set(test.testId, {
      ...test,
      attempts: [...attempts.values()].sort(byExecutionOrder),
    });
  });

  const manifest: DetoxManifest = {
    ...session,
    tests: [...merged.values()],
  };

  await fs.writeFile(filePath, JSON.stringify(manifest), 'utf8');
  debug('Detox manifest written to %s: %o', filePath, manifest);

  return filePath;
}

function getAttemptKey(attempt: DetoxManifestAttempt) {
  return `${attempt.session}:${attempt.invocations}`;
}

function byExecutionOrder(a: DetoxManifestAttempt, b: DetoxManifestAttempt) {
  return a.session - b.session || a.invocations - b.invocations;
}

async function readDetoxManifest(
  filePath: string
): Promise<DetoxManifest | undefined> {
  try {
    return await fs.readJson(filePath);
  } catch {
    return undefined;
  }
}
