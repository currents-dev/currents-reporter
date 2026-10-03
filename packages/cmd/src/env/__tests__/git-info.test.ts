import { afterEach, describe, expect, it, vi } from 'vitest';

const commitInfo = vi.hoisted(() => vi.fn());
vi.mock('@currents/commit-info', () => ({ commitInfo }));

import { getGitInfo } from '../gitInfo';

describe('getGitInfo', () => {
  afterEach(() => {
    getGitInfo.cache.clear?.();
  });

  it('sends the commit commit-info returns, with the field names of the API', async () => {
    commitInfo.mockResolvedValue({
      branch: 'feature/x',
      message: 'feat: x',
      email: 'jane@example.com',
      author: 'Jane',
      sha: 'abc',
      timestamp: '1700000000',
      remote: 'https://gitlab.com/o/r.git',
    });

    expect(await getGitInfo()).toEqual({
      branch: 'feature/x',
      message: 'feat: x',
      authorEmail: 'jane@example.com',
      authorName: 'Jane',
      sha: 'abc',
      remoteOrigin: 'https://gitlab.com/o/r.git',
      ghaEventData: null,
    });
  });
});
