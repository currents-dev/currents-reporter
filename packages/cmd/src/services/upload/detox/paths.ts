import { debug as _debug } from '@debug';
import { dirname, join } from 'path';

const debug = _debug.extend('detox');

const MAX_FILE_LENGTH = 255;
const UNSAFE_CHARACTERS = /[/\\?<>:*|"$\u0000-\u001f]/g;

export type TestArtifactsDirParams = {
  rootDir: string;
  fullName: string;
  status: string;
  invocations: number;
};

/**
 * Detox derives the number from the rerun index and the Jest retry count
 * (`testSessionIndex * (1 + retryTimes) + invocations`), which the reporter
 * cannot read for the spec files it did not run. The attempts are matched by
 * looking for the next number that exists on disk instead of recomputing it.
 */
export const MAX_INVOCATION_PROBE = 4;

/**
 * Detox builds the per-test artifact directory name itself - status sign, retry
 * suffix, sanitizing and trimming - so its own path builder is used when detox
 * is resolvable from the project. buildOwnTestArtifactsDir covers the case
 * where it is not, e.g. results uploaded from a machine without the app repo.
 */
export function getTestArtifactsDir(params: TestArtifactsDirParams): string {
  return buildDetoxTestArtifactsDir(params) ?? buildOwnTestArtifactsDir(params);
}

function buildDetoxTestArtifactsDir({
  rootDir,
  fullName,
  status,
  invocations,
}: TestArtifactsDirParams): string | undefined {
  try {
    const modulePath = require.resolve(
      'detox/src/artifacts/utils/ArtifactPathBuilder',
      { paths: [process.cwd()] }
    );
    const ArtifactPathBuilder = require(modulePath);
    const pathBuilder = new ArtifactPathBuilder({ rootDir });

    return dirname(
      pathBuilder.buildPathForTestArtifact('test.mp4', {
        fullName,
        status,
        invocations,
      })
    );
  } catch (e) {
    debug('Detox path builder is not available: %o', e);
    return undefined;
  }
}

function buildOwnTestArtifactsDir({
  rootDir,
  fullName,
  status,
  invocations,
}: TestArtifactsDirParams): string {
  const prefix = getStatusSign(status);
  const suffix = invocations > 1 ? ` (${invocations})` : '';
  const trimmed = fullName.slice(
    -MAX_FILE_LENGTH + prefix.length + suffix.length
  );
  const name = `${prefix}${trimmed}${suffix}`.replace(UNSAFE_CHARACTERS, '_');

  return join(rootDir, truncateBytes(name, MAX_FILE_LENGTH));
}

/** sanitize-filename, which Detox uses, caps the name at 255 bytes, not characters. */
function truncateBytes(value: string, maxBytes: number): string {
  const bytes = Buffer.from(value, 'utf8');
  if (bytes.length <= maxBytes) {
    return value;
  }

  return bytes
    .subarray(0, maxBytes)
    .toString('utf8')
    .replace(/\uFFFD$/, '');
}

function getStatusSign(status: string) {
  switch (status) {
    case 'passed':
      return '✓ ';
    case 'failed':
      return '✗ ';
    default:
      return '';
  }
}
