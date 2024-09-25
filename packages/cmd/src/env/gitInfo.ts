// @ts-ignore
import { commitInfo } from '@currents/commit-info';
import { memoize } from 'lodash';
import { mergeGitCommit } from './git-ci-provider';

export type GhaEventData = {
  headRef: string;
  headSha: string;
  baseRef: string;
  baseSha: string;
  issueUrl: string;
  htmlUrl: string;
  prTitle: string;
  senderAvatarUrl: string;
  senderHtmlUrl: string;
};

type DefaultFormat = {
  branch: string;
  message: string;
  email: string;
  author: string;
  sha: string;
  timestamp: string;
  remote: string;
  ghaEventData?: GhaEventData;
};

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

const _getGitInfo = async (): Promise<Commit> => {
  const commit: DefaultFormat = await commitInfo();

  return mergeGitCommit({
    branch: commit.branch,
    remoteOrigin: commit.remote,
    authorEmail: commit.email,
    authorName: commit.author,
    message: commit.message,
    sha: commit.sha,
    ghaEventData: commit.ghaEventData,
  }) as unknown as Commit;
};

export const getGitInfo = memoize(_getGitInfo);
