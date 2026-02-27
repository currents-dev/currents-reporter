export type ArtifactLevel = 'spec' | 'test' | 'attempt';
export type ArtifactType =
  | 'screenshot'
  | 'video'
  | 'trace'
  | 'attachment'
  | 'stdout'
  | 'coverage';

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
    const ext = path.split('.').pop()?.toLowerCase();
    // Simple inference logic
    if (ext === 'mp4') {
      type = type || 'video';
      contentType = contentType || 'video/mp4';
    } else if (ext === '.webm') {
      type = type || 'video';
      contentType = contentType || 'video/webm';
    } else if (ext === 'png') {
      type = type || 'screenshot';
      contentType = contentType || 'image/png';
    } else if (ext === 'jpg' || ext === 'jpeg') {
      type = type || 'screenshot';
      contentType = contentType || 'image/jpeg';
    } else if (ext === 'bmp') {
      type = type || 'screenshot';
      contentType = contentType || 'image/bmp';
    } else if (ext === 'txt') {
      type = type || 'attachment';
      contentType = contentType || 'text/plain';
    } else if (ext === 'json') {
      type = type || 'attachment';
      contentType = contentType || 'application/json';
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
