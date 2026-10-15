/**
 * Test suite for the "inc" and "notInc" operators. This is meant to be used when the input is an array.
 *
 * The "inc" operator checks if the input array matches any of the values in the toMatch array.
 * The "notInc" operator ensures none of the values in the toMatch array are found in the input.
 *
 *  Note that while these two are negations of each other, inc is a partial matcher, while notInc is an absolute.
 *
 *  Think of 'inc' as meaning 'includes some', so opposite would be 'missing some' which is actually the 'notIncAll' operator.
 *  Think of 'notInc' as meaning 'missing', so opposite would be 'includes' which is actually the 'incAll' operator.
 *
 */
import { describe, expect, it } from 'vitest';
import { OPS } from '../../const';
import { valuesMatch } from '../../rulesEval';

describe('Actions "inc"/"notInc" operators', () => {
  it('should match "inc" when any element in toMatch array matches input array', () => {
    const singleInput = {
      input: 'test',
      toMatch: ['test', 'test2'],
      op: OPS.INC,
      matchExact: true,
    };
    expect(valuesMatch(singleInput)).toBe(true);
    expect(valuesMatch({ ...singleInput, op: OPS.NOTINC })).toBe(false);

    const arrayInput = {
      input: ['test1', 'test2'],
      toMatch: ['test1', 'test3'],
      op: OPS.INC,
      matchExact: true,
    };
    expect(valuesMatch(arrayInput)).toBe(true);
    expect(valuesMatch({ ...arrayInput, op: OPS.NOTINC })).toBe(false);
  });

  it('should match "notInc" when none of the elements in toMatch array matches input array', () => {
    const singleInput = {
      input: 'test',
      toMatch: ['test3', 'test2'],
      op: OPS.INC,
      matchExact: true,
    };
    expect(valuesMatch(singleInput)).toBe(false);
    expect(valuesMatch({ ...singleInput, op: OPS.NOTINC })).toBe(true);

    const arrayInput = {
      input: ['test1', 'test2'],
      toMatch: ['test3', 'test4'],
      op: OPS.INC,
      matchExact: true,
    };
    expect(valuesMatch(arrayInput)).toBe(false);
    expect(valuesMatch({ ...arrayInput, op: OPS.NOTINC })).toBe(true);

    const negateArrayInput = {
      input: ['test2'],
      toMatch: ['test1', 'test2'],
      op: OPS.INC,
      matchExact: true,
    };
    expect(valuesMatch(negateArrayInput)).toBe(true);
    expect(valuesMatch({ ...negateArrayInput, op: OPS.NOTINC })).toBe(false);
  });

  it('should match "inc" when any regex in toMatch array matches input array (complex matcher)', () => {
    const singleInput = {
      input: 'test1',
      toMatch: [
        { type: 'RegexPattern' as const, pattern: 'test\\d+' },
        { type: 'RegexPattern' as const, pattern: 'test2' },
      ],
      op: OPS.INC,
    };
    expect(valuesMatch(singleInput)).toBe(true);
    expect(valuesMatch({ ...singleInput, op: OPS.NOTINC })).toBe(false);

    const arrayInput = {
      input: ['test1', 'test2'],
      toMatch: [
        { type: 'RegexPattern' as const, pattern: 'test\\d+' },
        { type: 'RegexPattern' as const, pattern: 'test3' },
      ],
      op: OPS.INC,
    };
    expect(valuesMatch(arrayInput)).toBe(true);
    expect(valuesMatch({ ...arrayInput, op: OPS.NOTINC })).toBe(false);
  });

  it('should match "notInc" when none of the regex in toMatch array matches input array (complex matcher)', () => {
    const singleInput = {
      input: 'test',
      toMatch: [
        { type: 'RegexPattern' as const, pattern: 'test\\d+' },
        { type: 'RegexPattern' as const, pattern: 'test.' },
      ],
      op: OPS.INC,
    };
    expect(valuesMatch(singleInput)).toBe(false);
    expect(valuesMatch({ ...singleInput, op: OPS.NOTINC })).toBe(true);

    const arrayInput = {
      input: ['test', 'dtest'],
      toMatch: [
        { type: 'RegexPattern' as const, pattern: 'test\\d+' },
        { type: 'RegexPattern' as const, pattern: 'test.' },
      ],
      op: OPS.INC,
    };
    expect(valuesMatch(arrayInput)).toBe(false);
    expect(valuesMatch({ ...arrayInput, op: OPS.NOTINC })).toBe(true);
  });
});
