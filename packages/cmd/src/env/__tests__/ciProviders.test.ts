import { getCiCommitInfo } from '@currents/commit-info';
import { isNil, omitBy } from 'lodash';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getCI } from '../ciProvider';

type Commit = {
  sha?: string;
  branch?: string;
  message?: string;
  authorName?: string;
  authorEmail?: string;
  remoteOrigin?: string;
};

type ProviderCase = {
  provider: string;
  // Variables the provider documents, with the values it sets.
  env: Record<string, string>;
  commit: Commit | undefined;
  // A variable the server reads to identify the build, and the key it gets in
  // ci.params.
  param?: [variable: string, key: string];
};

// Expected values come from each provider's documentation, not from the
// mapping in commit-info. A provider without commit variables has none.
const cases: ProviderCase[] = [
  {
    provider: 'appveyor',
    env: {
      APPVEYOR: 'True',
      APPVEYOR_BUILD_NUMBER: '12',
      APPVEYOR_REPO_COMMIT: 'sha-appveyor',
      APPVEYOR_REPO_BRANCH: 'main',
      APPVEYOR_REPO_COMMIT_MESSAGE: 'subject',
      APPVEYOR_REPO_COMMIT_MESSAGE_EXTENDED: 'body',
      APPVEYOR_REPO_COMMIT_AUTHOR: 'Ann',
      APPVEYOR_REPO_COMMIT_AUTHOR_EMAIL: 'ann@example.com',
    },
    commit: {
      sha: 'sha-appveyor',
      branch: 'main',
      message: 'subject\nbody',
      authorName: 'Ann',
      authorEmail: 'ann@example.com',
    },
    param: ['APPVEYOR_BUILD_NUMBER', 'appveyorBuildNumber'],
  },
  {
    provider: 'azure',
    env: {
      TF_BUILD: 'True',
      AZURE_HTTP_USER_AGENT: 'VSTS_agent',
      BUILD_BUILDID: '77',
      BUILD_SOURCEVERSION: 'sha-azure',
      BUILD_SOURCEBRANCHNAME: 'main',
      BUILD_SOURCEVERSIONMESSAGE: 'subject',
      BUILD_SOURCEVERSIONAUTHOR: 'Ann',
      BUILD_REQUESTEDFOREMAIL: 'ann@example.com',
    },
    commit: {
      sha: 'sha-azure',
      branch: 'main',
      message: 'subject',
      authorName: 'Ann',
      authorEmail: 'ann@example.com',
    },
    param: ['BUILD_BUILDID', 'buildBuildid'],
  },
  {
    provider: 'awsCodeBuild',
    env: {
      CODEBUILD_BUILD_ID: 'project:123',
      CODEBUILD_RESOLVED_SOURCE_VERSION: 'sha-codebuild',
      CODEBUILD_SOURCE_REPO_URL: 'https://example.com/repo.git',
    },
    commit: {
      sha: 'sha-codebuild',
      remoteOrigin: 'https://example.com/repo.git',
    },
    param: ['CODEBUILD_BUILD_ID', 'codebuildBuildId'],
  },
  {
    provider: 'bamboo',
    env: {
      bamboo_buildNumber: '5',
      bamboo_planRepository_revision: 'sha-bamboo',
      bamboo_planRepository_branch: 'main',
      bamboo_planRepository_username: 'Ann',
    },
    commit: { sha: 'sha-bamboo', branch: 'main', authorName: 'Ann' },
    param: ['bamboo_buildNumber', 'bambooBuildNumber'],
  },
  {
    provider: 'bitbucket',
    env: {
      BITBUCKET_BUILD_NUMBER: '8',
      BITBUCKET_COMMIT: 'sha-bitbucket',
      BITBUCKET_BRANCH: 'main',
      BITBUCKET_PIPELINE_UUID: '{uuid}',
    },
    commit: { sha: 'sha-bitbucket', branch: 'main' },
    param: ['BITBUCKET_PIPELINE_UUID', 'bitbucketPipelineUuid'],
  },
  {
    provider: 'buildkite',
    env: {
      BUILDKITE: 'true',
      BUILDKITE_BUILD_ID: 'bk-build',
      BUILDKITE_COMMIT: 'sha-buildkite',
      BUILDKITE_BRANCH: 'main',
      BUILDKITE_MESSAGE: 'subject',
      BUILDKITE_BUILD_CREATOR: 'Ann',
      BUILDKITE_BUILD_CREATOR_EMAIL: 'ann@example.com',
      BUILDKITE_REPO: 'git@example.com:org/repo.git',
      BUILDKITE_PIPELINE_DEFAULT_BRANCH: 'trunk',
    },
    commit: {
      sha: 'sha-buildkite',
      branch: 'main',
      message: 'subject',
      authorName: 'Ann',
      authorEmail: 'ann@example.com',
      remoteOrigin: 'git@example.com:org/repo.git',
    },
    param: ['BUILDKITE_BUILD_ID', 'buildkiteBuildId'],
  },
  {
    provider: 'circle',
    env: {
      CIRCLECI: 'true',
      CIRCLE_WORKFLOW_ID: 'wf-1',
      CIRCLE_SHA1: 'sha-circle',
      CIRCLE_BRANCH: 'main',
      CIRCLE_USERNAME: 'ann',
      CIRCLE_REPOSITORY_URL: 'git@example.com:org/repo.git',
    },
    commit: {
      sha: 'sha-circle',
      branch: 'main',
      authorName: 'ann',
      remoteOrigin: 'git@example.com:org/repo.git',
    },
    param: ['CIRCLE_WORKFLOW_ID', 'circleWorkflowId'],
  },
  {
    provider: 'concourse',
    env: { CONCOURSE_WORKER: 'worker', BUILD_ID: '9' },
    commit: undefined,
    param: ['BUILD_ID', 'buildId'],
  },
  {
    provider: 'codeFresh',
    env: {
      CF_BUILD_ID: 'cf-1',
      CF_REVISION: 'sha-codefresh',
      CF_BRANCH: 'main',
      CF_COMMIT_MESSAGE: 'subject',
      CF_COMMIT_AUTHOR: 'Ann',
    },
    commit: {
      sha: 'sha-codefresh',
      branch: 'main',
      message: 'subject',
      authorName: 'Ann',
    },
    param: ['CF_BUILD_ID', 'cfBuildId'],
  },
  {
    provider: 'drone',
    env: {
      DRONE: 'true',
      DRONE_BUILD_NUMBER: '3',
      DRONE_COMMIT_SHA: 'sha-drone',
      DRONE_SOURCE_BRANCH: 'feature',
      DRONE_COMMIT_MESSAGE: 'subject',
      DRONE_COMMIT_AUTHOR: 'ann',
      DRONE_COMMIT_AUTHOR_EMAIL: 'ann@example.com',
      DRONE_GIT_HTTP_URL: 'https://example.com/org/repo.git',
      DRONE_REPO_BRANCH: 'main',
    },
    commit: {
      sha: 'sha-drone',
      branch: 'feature',
      message: 'subject',
      authorName: 'ann',
      authorEmail: 'ann@example.com',
      remoteOrigin: 'https://example.com/org/repo.git',
    },
    param: ['DRONE_BUILD_NUMBER', 'droneBuildNumber'],
  },
  {
    provider: 'githubActions',
    env: {
      GITHUB_ACTIONS: 'true',
      GITHUB_RUN_ID: '100',
      GITHUB_REPOSITORY: 'org/repo',
      GITHUB_SHA: 'sha-gha',
      GITHUB_REF_NAME: 'main',
      GITHUB_RUN_ATTEMPT: '2',
    },
    commit: { sha: 'sha-gha', branch: 'main' },
    param: ['GITHUB_RUN_ID', 'githubRunId'],
  },
  {
    provider: 'gitlab',
    env: {
      GITLAB_CI: 'true',
      CI_PIPELINE_ID: '55',
      CI_COMMIT_SHA: 'sha-gitlab',
      CI_COMMIT_REF_NAME: 'main',
      CI_COMMIT_MESSAGE: 'subject',
      GITLAB_USER_NAME: 'Ann',
      GITLAB_USER_EMAIL: 'ann@example.com',
      CI_REPOSITORY_URL: 'https://example.com/org/repo.git',
      CI_DEFAULT_BRANCH: 'main',
    },
    commit: {
      sha: 'sha-gitlab',
      branch: 'main',
      message: 'subject',
      authorName: 'Ann',
      authorEmail: 'ann@example.com',
      remoteOrigin: 'https://example.com/org/repo.git',
    },
    param: ['CI_PIPELINE_ID', 'ciPipelineId'],
  },
  {
    provider: 'goCD',
    env: { GO_JOB_NAME: 'job', GO_PIPELINE_COUNTER: '4' },
    commit: undefined,
    param: ['GO_PIPELINE_COUNTER', 'goPipelineCounter'],
  },
  {
    provider: 'jenkins',
    env: {
      JENKINS_URL: 'https://jenkins.example.com/',
      BUILD_URL: 'https://jenkins.example.com/job/x/1/',
      GIT_COMMIT: 'sha-jenkins',
      GIT_BRANCH: 'main',
    },
    commit: { sha: 'sha-jenkins', branch: 'main' },
    param: ['BUILD_URL', 'buildUrl'],
  },
  {
    provider: 'googleCloud',
    env: {
      BUILD_ID: 'gcb-1',
      PROJECT_ID: 'project',
      PROJECT_NUMBER: '123',
      COMMIT_SHA: 'sha-gcb',
      BRANCH_NAME: 'main',
    },
    commit: { sha: 'sha-gcb', branch: 'main' },
    param: ['BUILD_ID', 'buildId'],
  },
  {
    provider: 'semaphore',
    env: {
      SEMAPHORE: 'true',
      SEMAPHORE_WORKFLOW_ID: 'wf-9',
      SEMAPHORE_GIT_SHA: 'sha-semaphore',
      SEMAPHORE_GIT_BRANCH: 'main',
    },
    commit: { sha: 'sha-semaphore', branch: 'main' },
    param: ['SEMAPHORE_WORKFLOW_ID', 'semaphoreWorkflowId'],
  },
  {
    provider: 'teamcity',
    env: { TEAMCITY_VERSION: '2024.1' },
    commit: undefined,
  },
  {
    provider: 'travis',
    env: {
      TRAVIS: 'true',
      TRAVIS_BUILD_ID: '31',
      TRAVIS_COMMIT: 'sha-travis',
      TRAVIS_BRANCH: 'main',
      TRAVIS_COMMIT_MESSAGE: 'subject',
    },
    commit: { sha: 'sha-travis', branch: 'main', message: 'subject' },
    param: ['TRAVIS_BUILD_ID', 'travisBuildId'],
  },
  {
    provider: 'netlify',
    env: {
      NETLIFY: 'true',
      BUILD_ID: 'nl-1',
      COMMIT_REF: 'sha-netlify',
      BRANCH: 'main',
      REPOSITORY_URL: 'https://example.com/org/repo',
    },
    commit: {
      sha: 'sha-netlify',
      branch: 'main',
      remoteOrigin: 'https://example.com/org/repo',
    },
    param: ['BUILD_ID', 'buildId'],
  },
];

function useEnv(env: Record<string, string>) {
  // Providers are detected from the variables that are set, so remove all
  // variables of the machine running the tests first.
  Object.keys(process.env).forEach((name) => vi.stubEnv(name, undefined));
  Object.entries(env).forEach(([name, value]) => vi.stubEnv(name, value));
}

// What fills the commit fields git cannot read, under the field names gitInfo.ts
// sends to the API.
function commitFromCi(): Commit {
  const { sha, branch, message, author, email, remote } = getCiCommitInfo();
  return omitBy(
    {
      sha,
      branch,
      message,
      authorName: author,
      authorEmail: email,
      remoteOrigin: remote,
    },
    isNil
  );
}

describe('CI providers', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe.each(cases)('$provider', ({ provider, env, commit, param }) => {
    beforeEach(() => {
      useEnv(env);
    });

    it('is detected from its variables', () => {
      expect(getCI().provider).toBe(provider);
    });

    it('reads the commit from its variables', () => {
      expect(commitFromCi()).toMatchObject(commit ?? {});
    });

    if (param) {
      it('passes the build variables to the server, which sets the build id', () => {
        const ci = getCI();

        expect(ci.params).toMatchObject({ [param[1]]: env[param[0]] });
        expect(ci.ciBuildId).toEqual({ source: 'server', value: null });
      });
    } else {
      it('generates a build id because it has no build variables', () => {
        expect(getCI().ciBuildId).toEqual({
          source: 'random',
          value: expect.stringMatching(/^auto:/),
        });
      });
    }

    it('uses the build id given by the user', () => {
      expect(getCI('given').ciBuildId).toEqual({
        source: 'user',
        value: 'given',
      });
    });
  });

  it('detects no provider on a machine without CI variables', () => {
    useEnv({});

    expect(getCI().provider).toBeNull();
    expect(commitFromCi()).toEqual({});
  });

  it('uses the head branch of a pull request on AppVeyor', () => {
    useEnv({
      APPVEYOR: 'True',
      APPVEYOR_REPO_BRANCH: 'main',
      APPVEYOR_PULL_REQUEST_HEAD_REPO_BRANCH: 'feature',
    });

    expect(commitFromCi()).toMatchObject({ branch: 'feature' });
  });

  it('uses the head commit and branch of a pull request on Travis', () => {
    useEnv({
      TRAVIS: 'true',
      TRAVIS_COMMIT: 'merge-commit',
      TRAVIS_BRANCH: 'main',
      TRAVIS_PULL_REQUEST_SHA: 'head-commit',
      TRAVIS_PULL_REQUEST_BRANCH: 'feature',
    });

    expect(commitFromCi()).toMatchObject({
      sha: 'head-commit',
      branch: 'feature',
    });
  });

  it('uses the head branch of a pull request on GitHub Actions', () => {
    useEnv({
      GITHUB_ACTIONS: 'true',
      GITHUB_REF: 'refs/pull/7/merge',
      GITHUB_REF_NAME: '7/merge',
      GITHUB_HEAD_REF: 'feature',
    });

    expect(commitFromCi()).toMatchObject({ branch: 'feature' });
  });

  // GitHub documents GITHUB_REF as the full ref, refs/heads/main. The short
  // name is GITHUB_REF_NAME.
  it('reads the short branch name on GitHub Actions', () => {
    useEnv({
      GITHUB_ACTIONS: 'true',
      GITHUB_REF: 'refs/heads/main',
      GITHUB_REF_NAME: 'main',
    });

    expect(commitFromCi()).toMatchObject({ branch: 'main' });
  });

  // Bamboo documents bamboo_planRepository_repositoryUrl, not
  // bamboo_planRepository_repositoryURL.
  it('reads the repository URL on Bamboo', () => {
    useEnv({
      bamboo_buildNumber: '5',
      bamboo_planRepository_repositoryUrl: 'https://example.com/repo.git',
    });

    expect(commitFromCi()).toMatchObject({
      remoteOrigin: 'https://example.com/repo.git',
    });
  });

  // Semaphore documents SEMAPHORE_GIT_URL as the clone URL.
  // SEMAPHORE_GIT_REPO_SLUG is "owner/repo".
  it('reads the clone URL on Semaphore', () => {
    useEnv({
      SEMAPHORE: 'true',
      SEMAPHORE_GIT_URL: 'git@example.com:org/repo.git',
      SEMAPHORE_GIT_REPO_SLUG: 'org/repo',
    });

    expect(commitFromCi()).toMatchObject({
      remoteOrigin: 'git@example.com:org/repo.git',
    });
  });

  // Concourse tasks get BUILD_ID, BUILD_PIPELINE_NAME and ATC_EXTERNAL_URL.
  // The CONCOURSE_ prefix the detection looks for is used by the Concourse
  // processes themselves.
  it.fails('detects Concourse from the variables a task receives', () => {
    useEnv({
      BUILD_ID: '9',
      BUILD_PIPELINE_NAME: 'pipeline',
      ATC_EXTERNAL_URL: 'https://ci.example.com',
    });

    expect(getCI().provider).toBe('concourse');
  });
});
