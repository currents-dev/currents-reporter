/**
 * Test suite for "in"/"notIn" operators in actions.
 *
 * The "in" operator checks if the input matches any of the values in the toMatch array.
 *  - If the input is an array, it makes more sense to use the "inc" operator,
 *    but the "in" operator will fallback to the same logic in that case as well.
 * The "notIn" operator ensures none of the values in the toMatch array match the input.
 */
import { describe, expect, it } from 'vitest';
import { OPS } from '../../const';
import { valuesMatch } from '../../rulesEval';

describe('Actions "in"/"notIn" operators', () => {
  it('should match "in" when any element in toMatch array matches input', () => {
    const singleInput = {
      input: 'test',
      toMatch: ['test', 'test2'],
      op: OPS.IN,
      matchExact: true,
    };
    expect(valuesMatch(singleInput)).toBe(true);
    expect(valuesMatch({ ...singleInput, op: OPS.NOTIN })).toBe(false);

    const arrayInput = {
      input: ['test1', 'test2'],
      toMatch: ['test1', 'test3'],
      op: OPS.IN,
      matchExact: true,
    };
    expect(valuesMatch(arrayInput)).toBe(true);
    expect(valuesMatch({ ...arrayInput, op: OPS.NOTIN })).toBe(false);
  });

  it('should match "notIn" when no elements in toMatch array match input', () => {
    const singleInput = {
      input: 'test',
      toMatch: ['test1', 'test2'],
      op: OPS.IN,
      matchExact: true,
    };
    expect(valuesMatch(singleInput)).toBe(false);
    expect(valuesMatch({ ...singleInput, op: OPS.NOTIN })).toBe(true);

    const arrayInput = {
      input: ['test1', 'test2'],
      toMatch: ['test3', 'test4'],
      op: OPS.IN,
      matchExact: true,
    };
    expect(valuesMatch(arrayInput)).toBe(false);
    expect(valuesMatch({ ...arrayInput, op: OPS.NOTIN })).toBe(true);
  });

  it('should match "in" when any regex in toMatch array matches input (complex matcher)', () => {
    const singleInput = {
      input: 'test',
      toMatch: [
        { type: 'RegexPattern' as const, pattern: '.?est' },
        { type: 'RegexPattern' as const, pattern: 'test2' },
      ],
      op: OPS.IN,
    };
    expect(valuesMatch(singleInput)).toBe(true);
    expect(valuesMatch({ ...singleInput, op: OPS.NOTIN })).toBe(false);

    const arrayInput = {
      input: ['test1', 'test2'],
      toMatch: [
        { type: 'RegexPattern' as const, pattern: 'test[1-3]' },
        { type: 'RegexPattern' as const, pattern: 'test3' },
      ],
      op: OPS.IN,
    };
    expect(valuesMatch(arrayInput)).toBe(true);
    expect(valuesMatch({ ...arrayInput, op: OPS.NOTIN })).toBe(false);
  });

  it('should match "notIn" when no regex in toMatch array match input (complex matcher)', () => {
    const singleInput = {
      input: 'test',
      toMatch: [
        { type: 'RegexPattern' as const, pattern: 'test[1-3]' },
        { type: 'RegexPattern' as const, pattern: 'test2' },
      ],
      op: OPS.IN,
    };
    expect(valuesMatch(singleInput)).toBe(false);
    expect(valuesMatch({ ...singleInput, op: OPS.NOTIN })).toBe(true);

    const arrayInput = {
      input: ['test1', 'test2'],
      toMatch: [
        { type: 'RegexPattern' as const, pattern: 'test[3-4]' },
        { type: 'RegexPattern' as const, pattern: 'test4' },
      ],
      op: OPS.IN,
    };
    expect(valuesMatch(arrayInput)).toBe(false);
    expect(valuesMatch({ ...arrayInput, op: OPS.NOTIN })).toBe(true);
  });
});
