import { commitInfo, type GhaEventData } from '@currents/commit-info';
import { memoize } from 'lodash';
import { debug as _debug } from '../debug';

const debug = _debug.extend('git');

export type { GhaEventData };

export type Commit = {
  sha: string;
  branch: string;
  authorName: string;
  authorEmail: string;
  message: string;
  remoteOrigin: string;
  // not sure if this one is ever used
  defaultBranch: null;
  ghaEventData?: GhaEventData;
};

/**
 * The commit from git, with the COMMIT_INFO_* and CI provider variables
 * filling what git could not read. The remote has no credentials.
 */
const _getGitInfo = async (): Promise<Commit> => {
  const commit = await commitInfo();
  debug('commit: %O', commit);

  return {
    branch: commit.branch,
    remoteOrigin: commit.remote,
    authorEmail: commit.email,
    authorName: commit.author,
    message: commit.message,
    sha: commit.sha,
    ghaEventData: commit.ghaEventData ?? null,
  } as unknown as Commit;
};

export const getGitInfo = memoize(_getGitInfo);
