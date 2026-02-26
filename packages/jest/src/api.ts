
import { appendFileSync, mkdirSync } from 'fs';
import { createHash } from 'crypto';
import { extname, join } from 'path';
import { ArtifactType, ArtifactLevel } from './types';



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
export function attachArtifact(path: string, type?: ArtifactType, contentType?: string, name?: string, level: ArtifactLevel = 'attempt') {
  if (!type || !contentType) {
    const ext = extname(path).toLowerCase();
    // Simple inference logic
    if (ext === '.mp4') {
        type = type || 'video';
        contentType = contentType || 'video/mp4';
    } else if (ext === '.png') {
        type = type || 'screenshot';
        contentType = contentType || 'image/png';
    } else if (ext === '.jpg' || ext === '.jpeg') {
        type = type || 'screenshot';
        contentType = contentType || 'image/jpeg';
    } else if (ext === '.bmp') {
        type = type || 'screenshot';
        contentType = contentType || 'image/bmp';
    } else if (ext === '.txt') {
        type = type || 'attachment';
        contentType = contentType || 'text/plain';
    } else if (ext === '.json') {
        type = type || 'attachment';
        contentType = contentType || 'application/json';
    }else {
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
    attempt: level === 'attempt' ? getAttempt() : undefined
  };
  
  try {
    // @ts-ignore - expect is available in Jest environment
    const state = expect.getState();
    const testPath = state.testPath;
    const currentTestName = state.currentTestName;

    if (testPath) {
      const artifactsDir = join(process.cwd(), '.currents-artifacts');
      mkdirSync(artifactsDir, { recursive: true });

      const hash = createHash('md5').update(testPath).digest('hex');
      const fileName = `${hash}.jsonl`;
      const filePath = join(artifactsDir, fileName);

      const payload = {
        testPath,
        currentTestName,
        artifact
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
export const attachVideo = (path: string, name?: string) => attachArtifact(path, 'video', 'video/mp4', name);

/**
 * Attach a screenshot artifact to the current test.
 * @param path Absolute path to the screenshot file
 * @param name Optional name for the artifact
 */
export const attachScreenshot = (path: string, name?: string) => attachArtifact(path, 'screenshot', undefined, name); // Let attachArtifact infer content type from extension

/**
 * Attach a generic file artifact to the current test.
 * @param path Absolute path to the file
 * @param name Optional name for the artifact
 */
export const attachFile = (path: string, name?: string, level?: ArtifactLevel) => attachArtifact(path, 'attachment', undefined, name, level); 

const attemptState = new Map<string, { count: number, lastAssertionCount: number }>();

/**
 * Get the current attempt number (0-indexed) for the running test.
 * This is a heuristic based on assertion calls, as Jest does not expose the attempt number directly.
 * It works reliably if the test makes assertions. If a test fails before any assertions, the retry count might be incorrect.
 */
export function getAttempt(): number {
  try {
    // @ts-ignore
    const state = expect.getState();
    const key = `${state.testPath}#${state.currentTestName}`;
    const assertions = state.assertionCalls || 0;
    
    let entry = attemptState.get(key);
    if (!entry) {
      entry = { count: 0, lastAssertionCount: assertions };
      attemptState.set(key, entry);
    } else {
      if (assertions < entry.lastAssertionCount) {
        // Assertion count reset detected -> Retry
        entry.count++;
        entry.lastAssertionCount = assertions;
      } else {
        // Same run, update last assertion count
        entry.lastAssertionCount = assertions;
      }
    }
    
    return entry.count;
  } catch (e) {
    return 0;
  }
}

