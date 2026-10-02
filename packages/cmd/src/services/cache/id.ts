import { camelCase } from 'lodash';
import { warnOnStderr } from '../../logger';

/**
 * The CI variables the API needs, per provider, to make the default cache ID
 * from the CI job: `generateRunCacheId` in the director's cacheAPI/utils.ts.
 * Keep the two lists the same. On a provider that is not listed, or when one
 * of its variables is missing, the API makes a random ID.
 */
const CACHE_ID_REQUIRED_VARIABLES: Record<string, string[]> = {
  githubActions: [],
  gitlab: [],
  appveyor: [
    'APPVEYOR_ACCOUNT_NAME',
    'APPVEYOR_PROJECT_SLUG',
    'APPVEYOR_BUILD_NUMBER',
  ],
  azure: ['SYSTEM_COLLECTIONID', 'BUILD_BUILDID'],
  awsCodeBuild: ['CODEBUILD_BUILD_ID'],
  bamboo: ['bamboo_buildKey', 'bamboo_buildNumber'],
  bitbucket: ['BITBUCKET_PIPELINE_UUID'],
  buildkite: ['BUILDKITE_BUILD_ID'],
  circle: ['CIRCLE_WORKFLOW_WORKSPACE_ID'],
  concourse: ['BUILD_ID'],
  codeFresh: ['CF_BUILD_ID'],
  drone: ['DRONE_BUILD_LINK'],
  goCD: ['GO_PIPELINE_NAME', 'GO_PIPELINE_COUNTER'],
  googleCloud: ['BUILD_ID'],
  jenkins: ['JOB_NAME', 'BUILD_NUMBER'],
  semaphore: ['SEMAPHORE_PIPELINE_ID'],
  travis: ['TRAVIS_JOB_ID'],
  netlify: ['BUILD_ID'],
};

/** What getCI returns; params is null on TeamCity. */
type CIJob = {
  provider: string | null;
  params: Record<string, unknown> | null;
};

export function isCIJobIdentified({ provider, params }: CIJob) {
  const required = provider ? CACHE_ID_REQUIRED_VARIABLES[provider] : null;
  if (!required || !params) return false;
  return required.every((name) => !!params[camelCase(name)]);
}

export function warnIfCacheIdIsRandom(ci: CIJob, id?: string) {
  if (id || isCIJobIdentified(ci)) return;
  warnOnStderr(
    'No CI job detected: without --id the cache ID is random, so cache get does not find what cache set saved. Pass --id to save and restore the same cache.'
  );
}
