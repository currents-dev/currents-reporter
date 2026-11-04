import { describe, expect, it } from 'vitest';
import { getNanoid, userFacingNanoid } from '../nano';

describe('nano ids', () => {
  it('has 16 letters and digits by default', () => {
    expect(getNanoid()).toMatch(/^[0-9A-Za-z]{16}$/);
    expect(getNanoid(8)).toMatch(/^[0-9A-Za-z]{8}$/);
  });

  it('has 12 letters and digits for user facing ids', () => {
    expect(userFacingNanoid()).toMatch(/^[0-9A-Za-z]{12}$/);
  });

  it('uses every character of the alphabet', () => {
    const chars = new Set(
      Array.from({ length: 200 }, () => getNanoid(64)).join('')
    );
    expect(chars.size).toBe(62);
  });
});
