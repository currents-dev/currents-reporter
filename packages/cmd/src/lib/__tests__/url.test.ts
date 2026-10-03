import { describe, expect, it } from 'vitest';
import { removeAuthFromUrl, urlForLog } from '../url';

describe('removeAuthFromUrl', () => {
  it.each([
    ['https://user:token@github.com/o/r.git', 'https://github.com/o/r.git'],
    [
      'https://gitlab-ci-token:abc@gitlab.com/o/r.git',
      'https://gitlab.com/o/r.git',
    ],
    ['ssh://git@github.com/o/r.git', 'ssh://github.com/o/r.git'],
    ['https://github.com/o/r.git', 'https://github.com/o/r.git'],
    ['git@github.com:o/r.git', 'git@github.com:o/r.git'],
    ['https://me@corp.com:tok@gitlab.com/r', 'https://gitlab.com/r'],
    ['https://github.com/o/r@v1', 'https://github.com/o/r@v1'],
    ['https://github.com?ref=a@b', 'https://github.com?ref=a@b'],
    ['https://github.com#a@b', 'https://github.com#a@b'],
  ])('%s', (input, expected) => {
    expect(removeAuthFromUrl(input)).toBe(expected);
  });
});

describe('urlForLog', () => {
  it.each([
    [
      'https://bucket.r2.dev/o/key.zip?X-Amz-Signature=abc',
      'https://bucket.r2.dev/o/key.zip',
    ],
    ['http://user:pass@proxy.corp:8080', 'http://proxy.corp:8080'],
    ['https://api.currents.dev/v1/runs#x', 'https://api.currents.dev/v1/runs'],
  ])('%s', (input, expected) => {
    expect(urlForLog(input)).toBe(expected);
  });
});
