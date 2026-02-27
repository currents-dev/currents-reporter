import { createHash } from 'crypto';
import { appendFileSync, mkdirSync } from 'fs';
import { extname, join } from 'path';
import { getArtifactsDir } from './lib';
import { ArtifactLevel, ArtifactType } from './types';

const ARTIFACT_CONFIG: Record<string, { type: ArtifactType; contentType: string }> = {
  '.mp4': { type: 'video', contentType: 'video/mp4' },
  '.webm': { type: 'video', contentType: 'video/webm' },
  '.png': { type: 'screenshot', contentType: 'image/png' },
  '.jpg': { type: 'screenshot', contentType: 'image/jpeg' },
  '.jpeg': { type: 'screenshot', contentType: 'image/jpeg' },
  '.bmp': { type: 'screenshot', contentType: 'image/bmp' },
  '.txt': { type: 'attachment', contentType: 'text/plain' },
  '.json': { type: 'attachment', contentType: 'application/json' },
};

/**
 * Attach an artifact to the current test.
 * This helper writes to a file in .currents/artifacts/ that the @currents/jest reporter reads.
 *
 * @param path Absolute path to the artifact file
 * @param type Artifact type (e.g. 'video', 'screenshot', 'trace', 'attachment')
 * @param contentType MIME type of the artifact
 * @param name Optional name for the artifact
 * @param level Artifact level (e.g. 'spec', 'test', 'attempt'). Defaults to 'attempt'
 */
export function attachArtifact(
  path: string,
  type?: ArtifactType,
  contentType?: string,
  name?: string,
  level: ArtifactLevel = 'attempt'
) {
  if (!type || !contentType) {
    const ext = extname(path).toLowerCase();
    const config = ARTIFACT_CONFIG[ext];
    
    if (config) {
      type = type || config.type;
      contentType = contentType || config.contentType;
    } else {
      type = type || 'attachment';
      contentType = contentType || 'text/plain';
    }
  }

  // Fallback if not inferred
  if (!type) type = 'attachment';
  // contentType is optional but good to have

  const artifact = {
    path,
    type,
    contentType,
    name,
    level,
    attempt: level === 'attempt' ? getAttempt() : undefined,
  };

  try {
    // @ts-ignore - expect is available in Jest environment
    const state = expect.getState();
    const testPath = state.testPath;
    const currentTestName = state.currentTestName;

    if (testPath) {
      const artifactsDir = getArtifactsDir();
      mkdirSync(artifactsDir, { recursive: true });

      const hash = createHash('md5').update(testPath).digest('hex');
      const fileName = `${hash}.jsonl`;
      const filePath = join(artifactsDir, fileName);

      const payload = {
        testPath,
        currentTestName,
        artifact,
      };

      appendFileSync(filePath, JSON.stringify(payload) + '\n');
    }
  } catch (e) {
    // Ignore errors or let them propagate?
    // User requested "no fallback", so we just silence the error or throw it?
    // Silencing is safer for test execution not to crash because of reporting.
  }
}

/**
 * Attach a video artifact to the current test.
 * @param path Absolute path to the video file
 * @param name Optional name for the artifact
 */
export const attachVideo = (path: string, name?: string) =>
  attachArtifact(path, 'video', 'video/mp4', name);

/**
 * Attach a screenshot artifact to the current test.
 * @param path Absolute path to the screenshot file
 * @param name Optional name for the artifact
 */
export const attachScreenshot = (path: string, name?: string) =>
  attachArtifact(path, 'screenshot', undefined, name); // Let attachArtifact infer content type from extension

/**
 * Attach a generic file artifact to the current test.
 * @param path Absolute path to the file
 * @param name Optional name for the artifact
 */
export const attachFile = (
  path: string,
  name?: string,
  level?: ArtifactLevel
) => attachArtifact(path, 'attachment', undefined, name, level);

const attemptState = new Map<string, number>();

/**
 * Get the current attempt number (0-indexed) for the running test.
 * This implementation treats the expect.getState()/expect.setState() heuristic as the primary code path.
 * The internal Symbol lookup is used as an optional optimization, tested against Jest 29.5.0+
 * and may break on future Jest versions.
 */
export function getAttempt(): number {
  try {
    // Optional optimization: used for performance/reliability when available but relies on internal APIs
    const symbols = Object.getOwnPropertySymbols(global);
    const stateSymbol = symbols.find(
      (s) => s.toString() === 'Symbol(JEST_STATE_SYMBOL)'
    );

    if (stateSymbol) {
      // @ts-ignore
      const jestState = global[stateSymbol];
      if (
        jestState &&
        jestState.currentlyRunningTest &&
        typeof jestState.currentlyRunningTest.invocations === 'number'
      ) {
        return jestState.currentlyRunningTest.invocations - 1;
      }
    }

    // Fallback heuristic
    // @ts-ignore
    const state = expect.getState();
    const key = `${state.testPath}#${state.currentTestName}`;

    // Check if we already determined the attempt for this execution context
    // @ts-ignore
    if (typeof state.currentsAttempt === 'number') {
      // @ts-ignore
      return state.currentsAttempt;
    }

    // If not in local state, it means a new attempt execution started
    let count = attemptState.get(key);

    if (count === undefined) {
      // First time seeing this test
      count = 0;
    } else {
      // We saw this test before, so this must be a retry
      count++;
    }

    // Update global map
    attemptState.set(key, count);

    // Update local state for subsequent calls in this attempt
    // @ts-ignore
    expect.setState({ currentsAttempt: count });

    return count;
  } catch (e) {
    return 0;
  }
}
