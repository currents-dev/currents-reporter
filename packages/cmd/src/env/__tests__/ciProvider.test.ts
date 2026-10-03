import { beforeEach, expect, it, vi } from 'vitest';
import { getCI } from '../ciProvider';

beforeEach(() => {
  vi.unstubAllEnvs();
});

it('should return explicit ci build id', () => {
  vi.stubEnv('GITHUB_ACTIONS', ''); // stub env to make sure CI doesn't fail the test
  expect(getCI('ciBuildId')).toEqual({
    ciBuildId: {
      source: 'user',
      value: 'ciBuildId',
    },
    params: {},
    provider: null,
  });
});

it('should return random ci build id', () => {
  vi.stubEnv('GITHUB_ACTIONS', ''); // stub env to make sure CI doesn't fail the test
  expect(getCI(undefined)).toEqual({
    ciBuildId: {
      source: 'random',
      value: expect.stringContaining('auto:'),
    },
    params: {},
    provider: null,
  });
});

it('should return server-detectable ci build id', () => {
  vi.stubEnv('GITHUB_ACTIONS', 'true');
  vi.stubEnv('GITHUB_WORKFLOW', 'GITHUB_WORKFLOW');
  vi.stubEnv('GITHUB_ACTION', 'GITHUB_ACTION');
  vi.stubEnv('GITHUB_RUN_ID', 'GITHUB_RUN_ID');
  vi.stubEnv('GITHUB_RUN_ATTEMPT', 'GITHUB_RUN_ATTEMPT');

  expect(getCI(undefined)).toEqual({
    ciBuildId: {
      source: 'server',
      value: null,
    },
    params: expect.objectContaining({
      githubAction: expect.any(String),
      githubRunAttempt: expect.any(String),
      githubRunId: expect.any(String),
      githubWorkflow: expect.any(String),
    }),
    provider: 'githubActions',
  });
});

it('removes credentials from the URLs in the CI params', () => {
  vi.stubEnv('GITHUB_ACTIONS', '');
  vi.stubEnv('GITLAB_CI', 'true');
  vi.stubEnv(
    'CI_REPOSITORY_URL',
    'https://gitlab-ci-token:job-token@gitlab.com/org/repo.git'
  );
  vi.stubEnv('CI_PROJECT_URL', 'https://gitlab.com/org/repo');

  expect(getCI(undefined).params).toMatchObject({
    ciRepositoryUrl: 'https://gitlab.com/org/repo.git',
    ciProjectUrl: 'https://gitlab.com/org/repo',
  });
});
