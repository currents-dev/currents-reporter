/**
 * Test suite for the "eq" and "neq" operators.
 *
 * The "eq" operator checks if the input matches the toMatch value.
 *  - ether value can be a string or an array of strings.
 *  - when the values are an array, both arrays must contain the same elements but order doesn't matter.
 * The "neq" operator is the negation of the "eq" operator.
 */
import { describe, expect, it } from 'vitest';
import { OPS } from '../../const';
import { valuesMatch } from '../../rulesEval';

describe('Actions "eq"/"neq" operators', () => {
  it('should match "eq" when input matches toMatch exactly', () => {
    const singleInput = {
      input: 'test',
      toMatch: 'test',
      op: OPS.EQ,
      matchExact: true,
    };
    expect(valuesMatch(singleInput)).toBe(true);
    expect(valuesMatch({ ...singleInput, op: OPS.NEQ })).toBe(false);
  });

  it('should match "neq" when input does not match toMatch exactly', () => {
    const singleInput = {
      input: 'test',
      toMatch: 'not-test',
      op: OPS.EQ,
      matchExact: true,
    };
    expect(valuesMatch(singleInput)).toBe(false);
    expect(valuesMatch({ ...singleInput, op: OPS.NEQ })).toBe(true);
  });

  it('should match "eq" when input matches regex toMatch (complex matcher)', () => {
    const singleInput = {
      input: 'test123',
      toMatch: [{ type: 'RegexPattern' as const, pattern: 'test\\d+' }],
      op: OPS.EQ,
    };
    expect(valuesMatch(singleInput)).toBe(true);
    expect(valuesMatch({ ...singleInput, op: OPS.NEQ })).toBe(false);

    const arrayInput = {
      input: ['test123', 'test456'],
      toMatch: [{ type: 'RegexPattern' as const, pattern: 'test\\d+' }],
      op: OPS.EQ,
    };
    expect(valuesMatch(arrayInput)).toBe(true);
    expect(valuesMatch({ ...arrayInput, op: OPS.NEQ })).toBe(false);
  });

  it('should match "neq" when input does not match regex toMatch (complex matcher)', () => {
    const singleInput = {
      input: 'test',
      toMatch: [{ type: 'RegexPattern' as const, pattern: 'test\\d+' }],
      op: OPS.EQ,
    };
    expect(valuesMatch(singleInput)).toBe(false);
    expect(valuesMatch({ ...singleInput, op: OPS.NEQ })).toBe(true);

    const arrayInput = {
      input: ['testa', 'testb'],
      toMatch: [{ type: 'RegexPattern' as const, pattern: 'test\\d+' }],
      op: OPS.EQ,
    };
    expect(valuesMatch(arrayInput)).toBe(false);
    expect(valuesMatch({ ...arrayInput, op: OPS.NEQ })).toBe(true);
  });

  it('should match "eq" when all elements in toMatch array match input', () => {
    const singleInput = {
      input: 'test',
      toMatch: ['test'],
      op: OPS.EQ,
      matchExact: true,
    };
    expect(valuesMatch(singleInput)).toBe(true);
    expect(valuesMatch({ ...singleInput, op: OPS.NEQ })).toBe(false);

    const arrayInput = {
      input: ['test1', 'test2'],
      toMatch: ['test1', 'test2'],
      op: OPS.EQ,
      matchExact: true,
    };
    expect(valuesMatch(arrayInput)).toBe(true);
    expect(valuesMatch({ ...arrayInput, op: OPS.NEQ })).toBe(false);
  });

  it('should match "neq" when not all elements in toMatch array match input', () => {
    const singleInput = {
      input: 'test',
      toMatch: ['test', 'test2'],
      op: OPS.EQ,
      matchExact: true,
    };
    expect(valuesMatch(singleInput)).toBe(false);
    expect(valuesMatch({ ...singleInput, op: OPS.NEQ })).toBe(true);

    const arrayInput = {
      input: ['test1', 'test2'],
      toMatch: ['test1', 'test3'],
      op: OPS.EQ,
      matchExact: true,
    };
    expect(valuesMatch(arrayInput)).toBe(false);
    expect(valuesMatch({ ...arrayInput, op: OPS.NEQ })).toBe(true);
  });
});
