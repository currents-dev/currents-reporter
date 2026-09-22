import { debug as _debug } from '@debug';
import fs from 'fs-extra';
import { join } from 'path';

const debug = _debug.extend('detox');

export const DETOX_MANIFEST_FILE = 'detox.json';

export type DetoxManifestAttempt = {
  attempt: number;
  /** The `detox test --retries` rerun this attempt ran in. */
  session?: number;
  invocations: number;
  status: string;
};

/**
 * Detox numbers a test's artifacts across the reruns of one session, while Jest
 * restarts its own attempt numbering in every rerun - so the attempts are put
 * back in execution order before they are matched to those numbers.
 */
export function inExecutionOrder(
  attempts: DetoxManifestAttempt[]
): DetoxManifestAttempt[] {
  return [...attempts].sort(
    (a, b) =>
      (a.session ?? 0) - (b.session ?? 0) || a.invocations - b.invocations
  );
}

export type DetoxManifestTest = {
  testId: string;
  fullName: string;
  attempts: DetoxManifestAttempt[];
};

export type DetoxManifest = {
  artifactsRootDir: string;
  configuration?: string;
  version?: string;
  tests: DetoxManifestTest[];
};

/** Written by @currents/jest when the tests ran under Detox; absent otherwise. */
export async function readDetoxManifest(
  reportDir: string
): Promise<DetoxManifest | undefined> {
  const filePath = join(reportDir, DETOX_MANIFEST_FILE);

  try {
    const manifest = (await fs.readJson(filePath)) as DetoxManifest;
    debug('Detox manifest: %o', manifest);
    return manifest;
  } catch {
    debug('No Detox manifest at %s', filePath);
    return undefined;
  }
}
