/*! @license

Parts of this code are from the following project: https://github.com/cypress-io/cypress with the following license:

MIT License

Copyright (c) 2022 Cypress.io

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/

// import debugFn from "debug";
// @ts-ignore
import { userFacingNanoid } from '@lib/nano';
import {
  camelCase,
  chain,
  findKey,
  isFunction,
  isNull,
  isString,
  set,
  some,
  transform,
} from 'lodash';
import { debug as _debug } from '../debug';
import { CiProvider, CiProviderData } from './types';

const debug = _debug.extend('ci');

const join = (char: string, ...pieces: (string | undefined)[]) => {
  return chain(pieces).compact().join(char).value();
};

const toCamelObject = (obj: any, key: string) => {
  return set(obj, camelCase(key), process.env[key]);
};

const extract = (envKeys: string[]) => {
  return transform(envKeys, toCamelObject, {});
};

/**
 * Returns true if running on Azure CI pipeline.
 * See environment variables in the issue #3657
 * @see https://github.com/cypress-io/cypress/issues/3657
 */
const isAzureCi = () => {
  return process.env.TF_BUILD && process.env.AZURE_HTTP_USER_AGENT;
};

const isAWSCodeBuild = () => {
  return some(process.env, (val, key) => {
    return /^CODEBUILD_/.test(key);
  });
};

const isBamboo = () => {
  return process.env.bamboo_buildNumber;
};

const isConcourse = () => {
  return some(process.env, (val, key) => {
    return /^CONCOURSE_/.test(key);
  });
};

const isGitlab = () => {
  return (
    process.env.GITLAB_CI ||
    (process.env.CI_SERVER_NAME && /^GitLab/.test(process.env.CI_SERVER_NAME))
  );
};

const isGoogleCloud = () => {
  // Cloud Build documents $BUILD_ID / $PROJECT_ID (often exposed as env when substitutions are mapped).
  return !!(
    (process.env.BUILD_ID &&
      process.env.PROJECT_ID &&
      process.env.PROJECT_NUMBER) ||
    // Older Google runtimes expose project-scoped env vars instead of Cloud Build substitutions.
    process.env.GCP_PROJECT ||
    process.env.GCLOUD_PROJECT ||
    process.env.GOOGLE_CLOUD_PROJECT
  );
};

const isJenkins = () => {
  return (
    process.env.JENKINS_URL ||
    process.env.JENKINS_HOME ||
    process.env.JENKINS_VERSION ||
    process.env.HUDSON_URL ||
    process.env.HUDSON_HOME
  );
};

/**
 * We detect CI providers by detecting an environment variable
 * unique to the provider, or by calling a function that returns true
 * for that provider.
 *
 * For example, AppVeyor CI has environment the
 * variable "APPVEYOR" set during run
 */
const CI_PROVIDERS = {
  /** @see https://www.appveyor.com/docs/environment-variables/ */
  appveyor: 'APPVEYOR',
  /** @see https://learn.microsoft.com/en-us/azure/devops/pipelines/build/variables */
  azure: isAzureCi,
  /** @see https://docs.aws.amazon.com/codebuild/latest/userguide/build-env-ref-env-vars.html */
  awsCodeBuild: isAWSCodeBuild,
  /** @see https://confluence.atlassian.com/bamboo/bamboo-variables-289277087.html */
  bamboo: isBamboo,
  /** @see https://support.atlassian.com/bitbucket-cloud/docs/pipeline-variables/ */
  bitbucket: 'BITBUCKET_BUILD_NUMBER',
  /** @see https://buildkite.com/docs/pipelines/environment-variables */
  buildkite: 'BUILDKITE',
  /** @see https://circleci.com/docs/variables/ */
  circle: 'CIRCLECI',
  /** @see https://concourse-ci.org/implementing-resource-types.html#resource-metadata */
  concourse: isConcourse,
  /** @see https://codefresh.io/docs/docs/codefresh-yaml/variables/ */
  codeFresh: 'CF_BUILD_ID',
  /** @see https://docs.drone.io/pipeline/environment/syntax/ */
  drone: 'DRONE',
  /** @see https://docs.github.com/en/actions/writing-workflows/variables-and-secrets */
  githubActions: 'GITHUB_ACTIONS',
  /** @see https://docs.gitlab.com/ee/ci/variables/predefined_variables.html */
  gitlab: isGitlab,
  /** @see https://docs.gocd.org/current/faq/dev_use_current_revision_in_build.html#standard-gocd-environment-variables */
  goCD: 'GO_JOB_NAME',
  /** @see https://www.jenkins.io/doc/book/pipeline/jenkinsfile/#using-environment-variables */
  jenkins: isJenkins,
  /** @see https://cloud.google.com/build/docs/configuring-builds/substitute-variable-values */
  googleCloud: isGoogleCloud,
  /** @see https://docs.semaphoreci.com/ci-cd-environment/environment-variables/ */
  semaphore: 'SEMAPHORE',
  /** @see https://www.jetbrains.com/help/teamcity/predefined-build-parameters.html */
  teamcity: 'TEAMCITY_VERSION',
  /** @see https://docs.travis-ci.com/user/environment-variables/ */
  travis: 'TRAVIS',
  /** @see https://docs.netlify.com/configure-builds/environment-variables/ */
  netlify: 'NETLIFY',
};

function _detectProviderName(): string | undefined {
  const { env } = process;
  // return the key of the first provider
  // which is truthy

  return findKey(CI_PROVIDERS, (value) => {
    if (isString(value)) {
      return env[value];
    }

    if (isFunction(value)) {
      return value();
    }
  });
}

/**
 * Reads CI metadata from `process.env` per provider; `extract` turns each name into a camelCase key.
 * Each `@see` matches the corresponding `CI_PROVIDERS` documentation link.
 */
const _providerCiParams = (): ProviderCiParamsRes => {
  return {
    /** @see https://www.appveyor.com/docs/environment-variables/ */
    appveyor: extract([
      'APPVEYOR_JOB_ID',
      'APPVEYOR_ACCOUNT_NAME',
      'APPVEYOR_PROJECT_SLUG',
      'APPVEYOR_BUILD_NUMBER',
      'APPVEYOR_BUILD_VERSION',
      'APPVEYOR_PULL_REQUEST_NUMBER',
      'APPVEYOR_PULL_REQUEST_HEAD_REPO_BRANCH',
    ]),
    /** @see https://learn.microsoft.com/en-us/azure/devops/pipelines/build/variables */
    azure: extract([
      'AGENT_BUILDDIRECTORY',
      'AGENT_ID',
      'AGENT_JOBNAME',
      'AGENT_JOBSTATUS',
      'AGENT_MACHINENAME',
      'AGENT_NAME',
      'AGENT_OS',
      'AGENT_OSARCHITECTURE',
      'BUILD_BUILDID',
      'BUILD_BUILDNUMBER',
      'BUILD_BUILDURI',
      'BUILD_CONTAINERID',
      'BUILD_CRONSCHEDULE_DISPLAYNAME',
      'BUILD_DEFINITIONNAME',
      'BUILD_DEFINITIONVERSION',
      'BUILD_QUEUEDBY',
      'BUILD_QUEUEDBYID',
      'BUILD_REASON',
      'BUILD_REPOSITORY_ID',
      'BUILD_REPOSITORY_NAME',
      'BUILD_REPOSITORY_PROVIDER',
      'BUILD_REPOSITORY_URI',
      'BUILD_REQUESTEDFOR',
      'BUILD_REQUESTEDFOREMAIL',
      'BUILD_REQUESTEDFORID',
      'BUILD_SOURCEBRANCH',
      'BUILD_SOURCEBRANCHNAME',
      'BUILD_SOURCESDIRECTORY',
      'BUILD_SOURCEVERSION',
      'BUILD_SOURCEVERSIONAUTHOR',
      'BUILD_SOURCEVERSIONMESSAGE',
      'BUILD_STAGINGDIRECTORY',
      'BUILD_TRIGGEREDBY_BUILDID',
      'BUILD_TRIGGEREDBY_BUILDNUMBER',
      'BUILD_TRIGGEREDBY_DEFINITIONID',
      'BUILD_TRIGGEREDBY_DEFINITIONNAME',
      'BUILD_TRIGGEREDBY_PROJECTID',
      'COMMON_TESTRESULTSDIRECTORY',
      'PIPELINE_WORKSPACE',
      'SYSTEM_COLLECTIONID',
      'SYSTEM_COLLECTIONURI',
      'SYSTEM_DEFAULTWORKINGDIRECTORY',
      'SYSTEM_DEFINITIONID',
      'SYSTEM_HOSTTYPE',
      'SYSTEM_JOBATTEMPT',
      'SYSTEM_JOBDISPLAYNAME',
      'SYSTEM_JOBID',
      'SYSTEM_JOBNAME',
      'SYSTEM_PHASEATTEMPT',
      'SYSTEM_PHASEDISPLAYNAME',
      'SYSTEM_PHASENAME',
      'SYSTEM_PLANID',
      // PR / branch policy builds
      'SYSTEM_PULLREQUEST_ISFORK',
      'SYSTEM_PULLREQUEST_PULLREQUESTID',
      'SYSTEM_PULLREQUEST_PULLREQUESTNUMBER',
      'SYSTEM_PULLREQUEST_SOURCEREPOSITORYURI',
      'SYSTEM_PULLREQUEST_SOURCEBRANCH',
      'SYSTEM_PULLREQUEST_SOURCECOMMITID',
      'SYSTEM_PULLREQUEST_TARGETBRANCH',
      'SYSTEM_PULLREQUEST_TARGETBRANCHNAME',
      'SYSTEM_STAGEATTEMPT',
      'SYSTEM_STAGEDISPLAYNAME',
      'SYSTEM_STAGENAME',
      'SYSTEM_TEAMFOUNDATIONCOLLECTIONURI',
      'SYSTEM_TEAMPROJECT',
      'SYSTEM_TEAMPROJECTID',
      'SYSTEM_TIMELINEID',
    ]),
    /** @see https://docs.aws.amazon.com/codebuild/latest/userguide/build-env-ref-env-vars.html */
    awsCodeBuild: extract([
      'AWS_DEFAULT_REGION',
      'AWS_REGION',
      'CODEBUILD_BATCH_BUILD_IDENTIFIER',
      'CODEBUILD_BUILD_ARN',
      'CODEBUILD_BUILD_ID',
      'CODEBUILD_BUILD_IMAGE',
      'CODEBUILD_BUILD_NUMBER',
      'CODEBUILD_BUILD_SUCCEEDING',
      'CODEBUILD_BUILD_URL',
      'CODEBUILD_INITIATOR',
      'CODEBUILD_PROJECT_ARN',
      'CODEBUILD_PUBLIC_BUILD_URL',
      'CODEBUILD_RESOLVED_SOURCE_VERSION',
      'CODEBUILD_SOURCE_REPO_URL',
      'CODEBUILD_SOURCE_VERSION',
      'CODEBUILD_SRC_DIR',
      'CODEBUILD_START_TIME',
      'CODEBUILD_WEBHOOK_ACTOR_ACCOUNT_ID',
      'CODEBUILD_WEBHOOK_BASE_REF',
      'CODEBUILD_WEBHOOK_EVENT',
      'CODEBUILD_WEBHOOK_HEAD_REF',
      'CODEBUILD_WEBHOOK_MERGE_COMMIT',
      'CODEBUILD_WEBHOOK_PREV_COMMIT',
      'CODEBUILD_WEBHOOK_TRIGGER',
      'CODEBUILD_WEBHOOK_LABEL',
      'CODEBUILD_WEBHOOK_RUN_ID',
      'CODEBUILD_WEBHOOK_JOB_ID',
      'CODEBUILD_WEBHOOK_WORKFLOW_NAME',
      'CODEBUILD_RUNNER_OWNER',
      'CODEBUILD_RUNNER_REPO',
      'CODEBUILD_RUNNER_REPO_DOMAIN',
      'CODEBUILD_RUNNER_WITH_BUILDSPEC',
    ]),
    /** @see https://confluence.atlassian.com/bamboo/bamboo-variables-289277087.html */
    bamboo: extract([
      'bamboo_buildNumber',
      'bamboo_buildResultsUrl',
      'bamboo_planRepository_repositoryUrl',
      'bamboo_buildKey',
    ]),
    /** @see https://support.atlassian.com/bitbucket-cloud/docs/variables-and-secrets/#Default-variables */
    bitbucket: extract([
      'CI',
      'BITBUCKET_WORKSPACE',
      'BITBUCKET_REPO_SLUG',
      'BITBUCKET_REPO_UUID',
      'BITBUCKET_REPO_FULL_NAME',
      'BITBUCKET_REPO_IS_PRIVATE',
      'BITBUCKET_REPO_OWNER',
      'BITBUCKET_REPO_OWNER_UUID',
      'BITBUCKET_PROJECT_KEY',
      'BITBUCKET_PROJECT_UUID',
      'BITBUCKET_BUILD_NUMBER',
      'BITBUCKET_PIPELINE_UUID',
      'BITBUCKET_STEP_UUID',
      'BITBUCKET_STEP_RUN_NUMBER',
      'BITBUCKET_STEP_TRIGGERER_UUID',
      'BITBUCKET_PARALLEL_STEP',
      'BITBUCKET_PARALLEL_STEP_COUNT',
      'BITBUCKET_CLONE_DIR',
      'BITBUCKET_COMMIT',
      'BITBUCKET_BRANCH',
      'BITBUCKET_TAG',
      'BITBUCKET_BOOKMARK',
      'BITBUCKET_GIT_HTTP_ORIGIN',
      'BITBUCKET_GIT_SSH_ORIGIN',
      // PR builds only
      'BITBUCKET_PR_ID',
      'BITBUCKET_PR_DESTINATION_BRANCH',
      'BITBUCKET_PR_DESTINATION_COMMIT',
      'BITBUCKET_DEPLOYMENT_ENVIRONMENT',
      'BITBUCKET_DEPLOYMENT_ENVIRONMENT_UUID',
      // set in after-script
      'BITBUCKET_EXIT_CODE',
    ]),
    /** @see https://buildkite.com/docs/pipelines/environment-variables */
    buildkite: extract([
      'BUILDKITE_ORGANIZATION_SLUG',
      'BUILDKITE_PIPELINE_ID',
      'BUILDKITE_PIPELINE_NAME',
      'BUILDKITE_PIPELINE_SLUG',
      'BUILDKITE_PIPELINE_DEFAULT_BRANCH',
      'BUILDKITE_REPO',
      'BUILDKITE_SOURCE',
      'BUILDKITE_BRANCH',
      'BUILDKITE_TAG',
      'BUILDKITE_COMMIT',
      'BUILDKITE_MESSAGE',
      'BUILDKITE_BUILD_AUTHOR',
      'BUILDKITE_BUILD_AUTHOR_EMAIL',
      'BUILDKITE_JOB_ID',
      'BUILDKITE_BUILD_ID',
      'BUILDKITE_BUILD_URL',
      'BUILDKITE_BUILD_NUMBER',
      'BUILDKITE_LABEL',
      'BUILDKITE_COMMAND',
      'BUILDKITE_STEP_ID',
      'BUILDKITE_STEP_KEY',
      'BUILDKITE_PARALLEL_JOB',
      'BUILDKITE_PARALLEL_JOB_COUNT',
      'BUILDKITE_RETRY_COUNT',
      'BUILDKITE_COMPUTE_TYPE',
      'BUILDKITE_CLUSTER_NAME',
      'BUILDKITE_PULL_REQUEST',
      'BUILDKITE_PULL_REQUEST_REPO',
      'BUILDKITE_PULL_REQUEST_BASE_BRANCH',
      'BUILDKITE_PULL_REQUEST_DRAFT',
      'BUILDKITE_PULL_REQUEST_LABELS',
      'BUILDKITE_MERGE_QUEUE_BASE_BRANCH',
      'BUILDKITE_MERGE_QUEUE_BASE_COMMIT',
      'BUILDKITE_REBUILT_FROM_BUILD_ID',
      'BUILDKITE_REBUILT_FROM_BUILD_NUMBER',
      'BUILDKITE_TRIGGERED_FROM_BUILD_ID',
      'BUILDKITE_TRIGGERED_FROM_BUILD_NUMBER',
      'BUILDKITE_TRIGGERED_FROM_BUILD_PIPELINE_SLUG',
    ]),
    /** @see https://circleci.com/docs/reference/variables/ */
    circle: extract([
      'CI',
      'CIRCLECI',
      'CIRCLE_BRANCH',
      'CIRCLE_BUILD_NUM',
      'CIRCLE_BUILD_URL',
      'CIRCLE_PREVIOUS_BUILD_NUM',
      'CIRCLE_JOB',
      'CIRCLE_WORKFLOW_ID',
      'CIRCLE_WORKFLOW_JOB_ID',
      'CIRCLE_WORKFLOW_WORKSPACE_ID',
      'CIRCLE_PIPELINE_ID',
      'CIRCLE_ORGANIZATION_ID',
      'CIRCLE_PROJECT_ID',
      'CIRCLE_PROJECT_REPONAME',
      'CIRCLE_PROJECT_USERNAME',
      'CIRCLE_REPOSITORY_URL',
      'CIRCLE_WORKING_DIRECTORY',
      'CIRCLE_SHA1',
      'CIRCLE_TAG',
      'CIRCLE_USERNAME',
      'CIRCLE_NODE_INDEX',
      'CIRCLE_NODE_TOTAL',
      'CIRCLE_PR_NUMBER',
      'CIRCLE_PR_REPONAME',
      'CIRCLE_PR_USERNAME',
      'CIRCLE_PULL_REQUEST',
      'CIRCLE_PULL_REQUESTS',
      'CI_PULL_REQUEST',
    ]),
    /** @see https://concourse-ci.org/implementing-resource-types.html#resource-metadata */
    concourse: extract([
      'BUILD_ID',
      'BUILD_NAME',
      'BUILD_JOB_NAME',
      'BUILD_PIPELINE_NAME',
      'BUILD_TEAM_NAME',
      'ATC_EXTERNAL_URL',
    ]),
    /** @see https://codefresh.io/docs/docs/codefresh-yaml/variables/ */
    codeFresh: extract([
      'CF_BUILD_ID',
      'CF_BUILD_URL',
      'CF_CURRENT_ATTEMPT',
      'CF_STEP_NAME',
      'CF_PIPELINE_NAME',
      'CF_PIPELINE_TRIGGER_ID',
      // variables added for pull requests
      'CF_PULL_REQUEST_ID',
      'CF_PULL_REQUEST_IS_FORK',
      'CF_PULL_REQUEST_NUMBER',
      'CF_PULL_REQUEST_TARGET',
    ]),
    /** @see https://docs.drone.io/pipeline/environment/syntax/ */
    drone: extract([
      'DRONE_BUILD_LINK',
      'DRONE_BUILD_NUMBER',
      'DRONE_PULL_REQUEST',
    ]),
    /** @see https://docs.github.com/en/actions/reference/variables-reference#default-environment-variables */
    githubActions: extract([
      'CI',
      'GITHUB_ACTIONS',
      'GITHUB_WORKFLOW',
      'GITHUB_WORKFLOW_REF',
      'GITHUB_WORKFLOW_SHA',
      'GITHUB_ACTION',
      'GITHUB_ACTION_PATH',
      'GITHUB_ACTION_REPOSITORY',
      'GITHUB_JOB',
      'GITHUB_EVENT_NAME',
      'GITHUB_EVENT_PATH',
      'GITHUB_RUN_ID',
      'GITHUB_RUN_NUMBER',
      'GITHUB_RUN_ATTEMPT',
      'GITHUB_REPOSITORY',
      'GITHUB_REPOSITORY_ID',
      'GITHUB_REPOSITORY_OWNER',
      'GITHUB_REPOSITORY_OWNER_ID',
      'GITHUB_REF',
      'GITHUB_REF_NAME',
      'GITHUB_REF_TYPE',
      'GITHUB_REF_PROTECTED',
      // PR workflows (pull_request / pull_request_target): base and head branch names.
      'GITHUB_BASE_REF',
      'GITHUB_HEAD_REF',
      'GITHUB_SHA',
      'GITHUB_ACTOR',
      'GITHUB_ACTOR_ID',
      'GITHUB_TRIGGERING_ACTOR',
      'GITHUB_SERVER_URL',
      'GITHUB_API_URL',
      'GITHUB_GRAPHQL_URL',
      'GITHUB_WORKSPACE',
      'GITHUB_RETENTION_DAYS',
      'RUNNER_OS',
      'RUNNER_ARCH',
      'RUNNER_NAME',
      'RUNNER_ENVIRONMENT',
      'RUNNER_DEBUG',
    ]),
    /** @see https://docs.gitlab.com/ee/ci/variables/predefined_variables.html */
    gitlab: extract([
      // pipeline is common among all jobs
      'CI_PIPELINE_ID',
      'CI_PIPELINE_URL',
      // individual jobs
      'CI_BUILD_ID', // build id and job id are aliases
      'CI_JOB_ID',
      'CI_JOB_URL',
      'CI_JOB_NAME',
      // matrix information
      'CI_NODE_INDEX',
      'CI_NODE_TOTAL',
      // other information
      'GITLAB_HOST',
      'CI_PROJECT_ID',
      'CI_PROJECT_URL',
      'CI_REPOSITORY_URL',
      'CI_ENVIRONMENT_URL',
      'CI_DEFAULT_BRANCH',
      // custom variables
      'RUN_ATTEMPT', // custom param that we ourselves sometimes add for retrying jobs
      // MR-specific variables (merge request pipelines only)
      'CI_MERGE_REQUEST_IID',
      'CI_MERGE_REQUEST_PROJECT_URL',
      'CI_MERGE_REQUEST_TITLE',
      'CI_MERGE_REQUEST_SOURCE_BRANCH_NAME',
      'CI_MERGE_REQUEST_TARGET_BRANCH_NAME',
      'CI_OPEN_MERGE_REQUESTS',
    ]),
    /** @see https://docs.gocd.org/current/faq/dev_use_current_revision_in_build.html#standard-gocd-environment-variables */
    goCD: extract([
      'GO_SERVER_URL',
      'GO_ENVIRONMENT_NAME',
      'GO_PIPELINE_NAME',
      'GO_PIPELINE_COUNTER',
      'GO_PIPELINE_LABEL',
      'GO_STAGE_NAME',
      'GO_STAGE_COUNTER',
      'GO_JOB_NAME',
      'GO_TRIGGER_USER',
      'GO_REVISION',
      'GO_TO_REVISION',
      'GO_FROM_REVISION',
      'GO_MATERIAL_HAS_CHANGED',
    ]),
    /** @see https://cloud.google.com/build/docs/configuring-builds/substitute-variable-values */
    googleCloud: extract([
      // individual jobs
      'BUILD_ID',
      'PROJECT_ID',
      // other information
      'REPO_NAME',
      'BRANCH_NAME',
      'TAG_NAME',
      'COMMIT_SHA',
      'SHORT_SHA',
    ]),
    /**
     * Core `env` variables from the Pipeline handbook; `GIT_*` from the Git plugin; `CHANGE_*` / `BRANCH_NAME` from
     * multibranch / SCM traits; `ghprb*` from the GitHub PR Builder plugin where used.
     *
     * @see https://www.jenkins.io/doc/book/pipeline/jenkinsfile/#using-environment-variables
     * @see https://plugins.jenkins.io/git/
     */
    jenkins: extract([
      'BRANCH_NAME',
      'BUILD_DISPLAY_NAME',
      'BUILD_ID',
      'BUILD_NUMBER',
      'BUILD_TAG',
      'BUILD_URL',
      'CHANGE_AUTHOR',
      'CHANGE_AUTHOR_DISPLAY_NAME',
      'CHANGE_AUTHOR_EMAIL',
      'CHANGE_BRANCH',
      'CHANGE_FORK',
      'CHANGE_ID',
      'CHANGE_TARGET',
      'CHANGE_TITLE',
      'CHANGE_URL',
      'CI',
      'EXECUTOR_NUMBER',
      'JAVA_HOME',
      'JENKINS_HOME',
      'JENKINS_URL',
      'JOB_BASE_NAME',
      'JOB_NAME',
      'JOB_URL',
      'NODE_LABELS',
      'NODE_NAME',
      'RUN_ARTIFACTS_DISPLAY_URL',
      'RUN_CHANGES_DISPLAY_URL',
      'TAG_NAME',
      'WORKSPACE',
      'WORKSPACE_TMP',
      'GIT_AUTHOR_EMAIL',
      'GIT_AUTHOR_NAME',
      'GIT_BRANCH',
      'GIT_COMMIT',
      'GIT_COMMITTER_EMAIL',
      'GIT_COMMITTER_NAME',
      'GIT_LOCAL_BRANCH',
      'GIT_PREVIOUS_COMMIT',
      'GIT_PREVIOUS_SUCCESSFUL_COMMIT',
      'GIT_URL',
      'ghprbActualCommit',
      'ghprbGhRepository',
      'ghprbPullId',
      'ghprbPullLink',
      'ghprbSourceBranch',
      'ghprbTargetBranch',
      'ghprbTriggerAuthorLogin',
    ]),
    /** @see https://docs.semaphoreci.com/ci-cd-environment/environment-variables/ (mix of v1 and v2 names). */
    semaphore: extract([
      'SEMAPHORE_BRANCH_ID',
      'SEMAPHORE_BUILD_NUMBER',
      'SEMAPHORE_CURRENT_JOB',
      'SEMAPHORE_CURRENT_THREAD',
      'SEMAPHORE_EXECUTABLE_UUID',
      'SEMAPHORE_GIT_BRANCH',
      'SEMAPHORE_GIT_DIR',
      'SEMAPHORE_GIT_REF',
      'SEMAPHORE_GIT_REF_TYPE',
      'SEMAPHORE_GIT_REPO_SLUG',
      'SEMAPHORE_GIT_SHA',
      'SEMAPHORE_GIT_URL',
      'SEMAPHORE_JOB_COUNT',
      'SEMAPHORE_JOB_ID', // v2
      'SEMAPHORE_JOB_NAME',
      'SEMAPHORE_JOB_UUID', // v1
      'SEMAPHORE_PIPELINE_ID',
      'SEMAPHORE_PLATFORM',
      'SEMAPHORE_PROJECT_DIR',
      'SEMAPHORE_PROJECT_HASH_ID',
      'SEMAPHORE_PROJECT_ID', // v2
      'SEMAPHORE_PROJECT_NAME',
      'SEMAPHORE_PROJECT_UUID', // v1
      'SEMAPHORE_REPO_SLUG',
      'SEMAPHORE_TRIGGER_SOURCE',
      'SEMAPHORE_WORKFLOW_ID',
      'PULL_REQUEST_NUMBER', // pull requests from forks ONLY
    ]),
    /** @see https://www.jetbrains.com/help/teamcity/predefined-build-parameters.html */
    teamcity: null,
    /** @see https://docs.travis-ci.com/user/environment-variables/ */
    travis: extract([
      'TRAVIS_JOB_ID',
      'TRAVIS_BUILD_ID',
      'TRAVIS_BUILD_WEB_URL',
      'TRAVIS_REPO_SLUG',
      'TRAVIS_JOB_NUMBER',
      'TRAVIS_EVENT_TYPE',
      'TRAVIS_COMMIT_RANGE',
      'TRAVIS_BUILD_NUMBER',
      'TRAVIS_PULL_REQUEST',
      'TRAVIS_PULL_REQUEST_BRANCH',
      'TRAVIS_PULL_REQUEST_SHA',
    ]),
    /** @see https://docs.netlify.com/configure-builds/environment-variables/ */
    netlify: extract([
      'BUILD_ID',
      'CONTEXT',
      'URL',
      'DEPLOY_URL',
      'DEPLOY_PRIME_URL',
      'DEPLOY_ID',
    ]),
  };
};

// tries to grab commit information from CI environment variables
// very useful to fill missing information when Git cannot grab correct values
const _providerCommitParams = (): ProviderCommitParamsRes => {
  const { env } = process;

  return {
    appveyor: {
      sha: env.APPVEYOR_REPO_COMMIT,
      // since APPVEYOR_REPO_BRANCH will be the target branch on a PR
      // we need to use PULL_REQUEST_HEAD_REPO_BRANCH if it exists.
      // e.g. if you have a PR: develop <- my-feature-branch
      // my-feature-branch is APPVEYOR_PULL_REQUEST_HEAD_REPO_BRANCH
      // develop           is APPVEYOR_REPO_BRANCH
      branch:
        env.APPVEYOR_PULL_REQUEST_HEAD_REPO_BRANCH || env.APPVEYOR_REPO_BRANCH,
      message: join(
        '\n',
        env.APPVEYOR_REPO_COMMIT_MESSAGE,
        env.APPVEYOR_REPO_COMMIT_MESSAGE_EXTENDED
      ),
      authorName: env.APPVEYOR_REPO_COMMIT_AUTHOR,
      authorEmail: env.APPVEYOR_REPO_COMMIT_AUTHOR_EMAIL,
      // remoteOrigin: ???
      // defaultBranch: ???
    },
    awsCodeBuild: {
      sha: env.CODEBUILD_RESOLVED_SOURCE_VERSION,
      // branch: ???,
      // message: ???
      // authorName: ???
      // authorEmail: ???
      remoteOrigin: env.CODEBUILD_SOURCE_REPO_URL,
      // defaultBranch: ???
    },
    azure: {
      sha: env.BUILD_SOURCEVERSION,
      branch: env.BUILD_SOURCEBRANCHNAME,
      message: env.BUILD_SOURCEVERSIONMESSAGE,
      authorName: env.BUILD_SOURCEVERSIONAUTHOR,
      authorEmail: env.BUILD_REQUESTEDFOREMAIL,
    },
    bamboo: {
      sha: env.bamboo_planRepository_revision,
      branch: env.bamboo_planRepository_branch,
      // message: ???
      authorName: env.bamboo_planRepository_username,
      // authorEmail: ???
      remoteOrigin: env.bamboo_planRepository_repositoryURL,
      // defaultBranch: ???
    },
    bitbucket: {
      sha: env.BITBUCKET_COMMIT,
      branch: env.BITBUCKET_BRANCH,
      // message: ???
      // authorName: ???
      // authorEmail: ???
      // remoteOrigin: ???
      // defaultBranch: ???
    },
    buildkite: {
      sha: env.BUILDKITE_COMMIT,
      branch: env.BUILDKITE_BRANCH,
      message: env.BUILDKITE_MESSAGE,
      authorName: env.BUILDKITE_BUILD_CREATOR,
      authorEmail: env.BUILDKITE_BUILD_CREATOR_EMAIL,
      remoteOrigin: env.BUILDKITE_REPO,
      defaultBranch: env.BUILDKITE_PIPELINE_DEFAULT_BRANCH,
    },
    circle: {
      sha: env.CIRCLE_SHA1,
      branch: env.CIRCLE_BRANCH,
      // message: ???
      authorName: env.CIRCLE_USERNAME,
      // authorEmail: ???
      remoteOrigin: env.CIRCLE_REPOSITORY_URL,
      // defaultBranch: ???
    },
    codeFresh: {
      sha: env.CF_REVISION,
      branch: env.CF_BRANCH,
      message: env.CF_COMMIT_MESSAGE,
      authorName: env.CF_COMMIT_AUTHOR,
    },
    drone: {
      sha: env.DRONE_COMMIT_SHA,
      // https://docs.drone.io/pipeline/environment/reference/drone-source-branch/
      branch: env.DRONE_SOURCE_BRANCH,
      message: env.DRONE_COMMIT_MESSAGE,
      authorName: env.DRONE_COMMIT_AUTHOR,
      authorEmail: env.DRONE_COMMIT_AUTHOR_EMAIL,
      remoteOrigin: env.DRONE_GIT_HTTP_URL,
      defaultBranch: env.DRONE_REPO_BRANCH,
    },
    githubActions: {
      sha: env.GITHUB_SHA,
      branch: env.GH_BRANCH || env.GITHUB_REF,
      defaultBranch: env.GITHUB_BASE_REF,
      remoteBranch: env.GITHUB_HEAD_REF,
      runAttempt: env.GITHUB_RUN_ATTEMPT,
    },
    gitlab: {
      sha: env.CI_COMMIT_SHA,
      branch: env.CI_COMMIT_REF_NAME,
      message: env.CI_COMMIT_MESSAGE,
      authorName: env.GITLAB_USER_NAME,
      authorEmail: env.GITLAB_USER_EMAIL,
      remoteOrigin: env.CI_REPOSITORY_URL,
      defaultBranch: env.CI_DEFAULT_BRANCH,
    },
    googleCloud: {
      sha: env.COMMIT_SHA,
      branch: env.BRANCH_NAME,
      // message: ??
      // authorName: ??
      // authorEmail: ??
      // remoteOrigin: ???
      // defaultBranch: ??
    },
    jenkins: {
      sha: env.GIT_COMMIT,
      branch: env.GIT_BRANCH,
      // message: ???
      // authorName: ???
      // authorEmail: ???
      // remoteOrigin: ???
      // defaultBranch: ???
    },
    // Only from forks? https://semaphoreci.com/docs/available-environment-variables.html
    semaphore: {
      sha: env.SEMAPHORE_GIT_SHA,
      branch: env.SEMAPHORE_GIT_BRANCH,
      // message: ???
      // authorName: ???
      // authorEmail: ???
      remoteOrigin: env.SEMAPHORE_GIT_REPO_SLUG,
      // defaultBranch: ???
    },
    snap: null,
    teamcity: null,
    travis: {
      sha: env.TRAVIS_PULL_REQUEST_SHA || env.TRAVIS_COMMIT,
      // for PRs, TRAVIS_BRANCH is the base branch being merged into
      branch: env.TRAVIS_PULL_REQUEST_BRANCH || env.TRAVIS_BRANCH,
      // authorName: ???
      // authorEmail: ???
      message: env.TRAVIS_COMMIT_MESSAGE,
      // remoteOrigin: ???
      // defaultBranch: ???
    },
    netlify: {
      sha: env.COMMIT_REF,
      branch: env.BRANCH,
      remoteOrigin: env.REPOSITORY_URL,
    },
  };
};

interface ProviderCommitParamsRes {
  [key: string]: CiProviderData | null;
}

interface ProviderCiParamsRes {
  [key: string]: {
    [key: string]: string | undefined;
  } | null;
}

const _get = (fn: () => ProviderCommitParamsRes | ProviderCiParamsRes) => {
  const providerName = getCiProvider();
  if (!providerName) return {};

  return chain(fn()).get(providerName).value();
};

// grab all detectable providers
// that we can extract ciBuildId from
function detectableCiBuildIdProviders() {
  return chain(_providerCiParams()).omitBy(isNull).keys().value();
}

/**
 * Check if we can fetch build ID automatically from CI variables.
 */
export function isCiBuildIdDetectable(ciProvider: string | null) {
  return ciProvider && detectableCiBuildIdProviders().includes(ciProvider);
}

function getCiProvider(): CiProvider {
  const providerName = _detectProviderName();
  debug('detected CI provider name: %s', providerName);
  return providerName || null;
}

function getCiParams() {
  return _get(_providerCiParams);
}

export function getCommitParams() {
  return _get(_providerCommitParams);
}

export function getCI(explicitCiBuildId?: string | undefined) {
  const params = getCiParams();
  const provider = getCiProvider();
  const ciBuildId = getCIBuildId(explicitCiBuildId, provider);

  debug('detected CI provider: %s', provider);
  debug('detected CI params: %O', params);
  debug('detected CI build ID: %o', ciBuildId);

  return {
    params,
    provider,
    ciBuildId,
  };
}

type CIBuildIdStruct =
  | {
      source: 'user'; // provided by the user
      value: string;
    }
  | {
      source: 'server'; // expected to be generated by the Currents server
      value: null;
    }
  | {
      source: 'random'; // generated by the reporter
      value: string;
    };

/**
 * Get CI build ID from explicit value or CI provider.
 *
 * @param explicitValue
 * @param provider
 * @returns {CIBuildIdStruct} CI build ID source and value.
 */
function getCIBuildId(
  explicitValue: string | undefined,
  provider: CiProvider | null
): CIBuildIdStruct {
  if (explicitValue) {
    return {
      source: 'user' as const,
      value: explicitValue,
    };
  }
  if (!isCiBuildIdDetectable(provider)) {
    return {
      source: 'random' as const,
      value: `auto:${userFacingNanoid()}`,
    };
  }
  return {
    source: 'server' as const,
    value: null,
  };
}
