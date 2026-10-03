import { describe, expect, it } from 'vitest';
import { mergeGitCommit } from '../git-ci-provider';

describe('git-info', () => {
  it('should merge the git info for teamcity', () => {
    const expected = {
      branch: 'main',
      remoteOrigin: 'origin',
      ghaEventData: null,
    };
    // eslint-disable-next-line turbo/no-undeclared-env-vars
    process.env.TEAMCITY_VERSION = '1';
    const result = mergeGitCommit({
      branch: 'main',
      remoteOrigin: 'origin',
      ghaEventData: null,
    });
    expect(result).toMatchObject(expected);
  });

  it('removes a token from the remote, in the result and in the debug output', () => {
    const result = mergeGitCommit({
      branch: 'main',
      remoteOrigin: 'https://oauth2:secret-token@gitlab.com/o/r.git',
      ghaEventData: null,
    });
    expect(result.remoteOrigin).toBe('https://gitlab.com/o/r.git');
  });
});
