import { afterEach, describe, expect, it, vi } from 'vitest';
import { isCIJobIdentified, warnIfCacheIdIsRandom } from '../id';

describe('isCIJobIdentified', () => {
  it.each([
    ['no CI', { provider: null, params: null }],
    ['TeamCity', { provider: 'teamcity', params: null }],
    ['an unknown provider', { provider: 'someCI', params: { a: '1' } }],
    ['CircleCI without its workspace ID', { provider: 'circle', params: {} }],
    [
      'Jenkins without its build number',
      { provider: 'jenkins', params: { jobName: 'e2e' } },
    ],
  ])('is false for %s', (_name, ci) => {
    expect(isCIJobIdentified(ci)).toBe(false);
  });

  it.each([
    ['GitHub Actions', { provider: 'githubActions', params: {} }],
    ['GitLab', { provider: 'gitlab', params: {} }],
    [
      'CircleCI',
      { provider: 'circle', params: { circleWorkflowWorkspaceId: 'w' } },
    ],
    [
      'Jenkins',
      { provider: 'jenkins', params: { jobName: 'e2e', buildNumber: '7' } },
    ],
    [
      'Bamboo',
      {
        provider: 'bamboo',
        params: { bambooBuildKey: 'K', bambooBuildNumber: '3' },
      },
    ],
  ])('is true for %s', (_name, ci) => {
    expect(isCIJobIdentified(ci)).toBe(true);
  });
});

describe('warnIfCacheIdIsRandom', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('prints one line on stderr when no CI job is detected', () => {
    const stderr = vi.spyOn(console, 'error').mockReturnValue();
    const stdout = vi.spyOn(console, 'log').mockReturnValue();

    warnIfCacheIdIsRandom({ provider: null, params: null });

    expect(stderr).toHaveBeenCalledTimes(1);
    expect(stderr.mock.calls[0].join(' ')).toContain(
      'No CI job detected: without --id the cache ID is random'
    );
    expect(stdout).not.toHaveBeenCalled();
  });

  it('prints nothing with --id', () => {
    const stderr = vi.spyOn(console, 'error').mockReturnValue();

    warnIfCacheIdIsRandom({ provider: null, params: null }, 'my-id');

    expect(stderr).not.toHaveBeenCalled();
  });

  it('prints nothing when the CI job is identified', () => {
    const stderr = vi.spyOn(console, 'error').mockReturnValue();

    warnIfCacheIdIsRandom({ provider: 'githubActions', params: {} });

    expect(stderr).not.toHaveBeenCalled();
  });
});
