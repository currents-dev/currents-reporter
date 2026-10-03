import { describe, expect, it } from 'vitest';
import { removeAuthFromUrl } from '../url';

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
  ])('%s', (input, expected) => {
    expect(removeAuthFromUrl(input)).toBe(expected);
  });
});
