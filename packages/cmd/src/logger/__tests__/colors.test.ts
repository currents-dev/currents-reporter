import { afterEach, describe, expect, it, vi } from 'vitest';
import { dim, red, titleContent } from '../logger';

describe('color helpers', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('adds no color when the output is not a terminal', () => {
    vi.stubEnv('FORCE_COLOR', undefined);
    expect(red('a')).toBe('a');
    expect(titleContent('title')).toBe('title');
  });

  it('adds the color codes with FORCE_COLOR', () => {
    vi.stubEnv('FORCE_COLOR', '1');
    expect(red('a')).toBe('\u001b[31ma\u001b[39m');
    expect(titleContent('title')).toBe(
      '\u001b[34m\u001b[1mtitle\u001b[22m\u001b[39m'
    );
  });

  it('joins the arguments with spaces and keeps empty text empty', () => {
    vi.stubEnv('FORCE_COLOR', '1');
    expect(red('a', 1)).toBe('\u001b[31ma 1\u001b[39m');
    expect(dim('')).toBe('');
  });
});
