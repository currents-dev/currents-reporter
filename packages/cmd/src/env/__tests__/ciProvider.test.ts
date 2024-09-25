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
