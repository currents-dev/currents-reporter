/**
 * Test suite for the "any" and "empty" operators.
 *
 * The "any" operator checks if the input is set.
 * The "empty" operator checks if the input is empty.
 *
 */
import { describe, expect, it } from 'vitest';
import { OPS } from '../../const';
import { valuesMatch } from '../../rulesEval';

describe('Actions "any"/"empty" operators', () => {
  it('should match "any" when input is set', () => {
    const singleInput = {
      input: 'test',
      toMatch: null,
      op: OPS.ANY,
      matchExact: true,
    };
    expect(valuesMatch(singleInput)).toBe(true);
    expect(valuesMatch({ ...singleInput, op: OPS.EMPTY })).toBe(false);

    const arrayInput = {
      input: ['test1', 'test2'],
      toMatch: null,
      op: OPS.ANY,
      matchExact: true,
    };
    expect(valuesMatch(arrayInput)).toBe(true);
    expect(valuesMatch({ ...arrayInput, op: OPS.EMPTY })).toBe(false);
  });

  it('should match "empty" when input is empty', () => {
    const singleInput = {
      input: undefined,
      toMatch: null,
      op: OPS.ANY,
      matchExact: true,
    };
    expect(valuesMatch(singleInput)).toBe(false);
    expect(valuesMatch({ ...singleInput, op: OPS.EMPTY })).toBe(true);

    const arrayInput = {
      input: [],
      toMatch: null,
      op: OPS.ANY,
      matchExact: true,
    };
    expect(valuesMatch(arrayInput)).toBe(false);
    expect(valuesMatch({ ...arrayInput, op: OPS.EMPTY })).toBe(true);
  });
});
