export type ArtifactLevel = 'spec' | 'test' | 'attempt';
export type ArtifactType =
  | 'screenshot'
  | 'video'
  | 'trace'
  | 'attachment'
  | 'stdout'
  | 'coverage';

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
 * This helper logs a JSON string that the `convert` command recognizes.
 *
 * @param path Absolute path to the artifact file
 * @param type Artifact type (e.g. 'video', 'screenshot', 'attachment')
 * @param contentType MIME type of the artifact
 * @param level Artifact level (e.g. 'spec', 'test', 'attempt'). Defaults to 'attempt'
 */
export function attachArtifact(
  path: string,
  type?: ArtifactType,
  contentType?: string,
  level: ArtifactLevel = 'attempt'
) {
  if (!type || !contentType) {
    const ext = path.substring(path.lastIndexOf('.')).toLowerCase();
    const config = ARTIFACT_CONFIG[ext];
    
    if (config) {
      type = type || config.type;
      contentType = contentType || config.contentType;
    } else {
      type = type || 'attachment';
      contentType = contentType || 'text/plain';
    }
  }

  const artifact = {
    path,
    type,
    contentType,
    level,
  };

  console.log('currents.artifact.' + JSON.stringify(artifact));
}

/**
 * Attach a video artifact to the current test.
 * @param path Absolute path to the video file
 */
export const attachVideo = (path: string) =>
  attachArtifact(path, 'video', 'video/mp4');

/**
 * Attach a screenshot artifact to the current test.
 * @param path Absolute path to the screenshot file
 */
export const attachScreenshot = (path: string) =>
  attachArtifact(path, 'screenshot');

/**
 * Attach a generic file artifact to the current test.
 * @param path Absolute path to the file
 * @param level Optional artifact level
 */
export const attachFile = (path: string, level?: ArtifactLevel) =>
  attachArtifact(path, undefined, undefined, level);
