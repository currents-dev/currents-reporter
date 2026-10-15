/**
 * Test suite for the "incAll" and "notIncAll" operators.
 *
 * The "incAll" operator checks if all the elements in the `toMatch` array are found in the `input` array.
 * The "notIncAll" operator ensures at least one of the elements in the `toMatch` array are missing in the `input` array.
 *
 *  Note that while these two are negations of each other, incAll is an absolute matcher, while notInAll only checks for some partial misses.
 *
 *  Think of 'incAll' as meaning 'includes', so opposite would be 'missing' which is actually the 'notInc' operator.
 *  Think of 'notIncAll' as meaning 'missing some', so opposite would be 'includes some' which is actually the 'inc' operator.
 *
 */
import { describe, expect, it } from 'vitest';
import { OPS } from '../../const';
import { valuesMatch } from '../../rulesEval';

describe('Actions "incAll"/"notIncAll" operators', () => {
  it('should match "incAll" when all elements in toMatch array matches input array', () => {
    const singleInput = {
      input: 'test',
      toMatch: ['test'],
      op: OPS.INCALL,
      matchExact: true,
    };
    expect(valuesMatch(singleInput)).toBe(true);
    expect(valuesMatch({ ...singleInput, op: OPS.NOTINCALL })).toBe(false);

    const arrayInput = {
      input: ['test1', 'test2'],
      toMatch: ['test1', 'test2'],
      op: OPS.INCALL,
      matchExact: true,
    };
    expect(valuesMatch(arrayInput)).toBe(true);
    expect(valuesMatch({ ...arrayInput, op: OPS.NOTINCALL })).toBe(false);
  });

  it('should match "notIncAll" when only some of the elements in toMatch array match input array', () => {
    const singleInput = {
      input: 'test',
      toMatch: ['test', 'test2'],
      op: OPS.INCALL,
      matchExact: true,
    };
    expect(valuesMatch(singleInput)).toBe(false);
    expect(valuesMatch({ ...singleInput, op: OPS.NOTINCALL })).toBe(true);

    const arrayInput = {
      input: ['test1', 'test2'],
      toMatch: ['test1', 'test4'],
      op: OPS.INCALL,
      matchExact: true,
    };
    expect(valuesMatch(arrayInput)).toBe(false);
    expect(valuesMatch({ ...arrayInput, op: OPS.NOTINCALL })).toBe(true);
  });

  it('should match "notIncAll" when none of the elements in toMatch array match input array', () => {
    const singleInput = {
      input: 'test',
      toMatch: ['test3', 'test2'],
      op: OPS.INCALL,
      matchExact: true,
    };
    expect(valuesMatch(singleInput)).toBe(false);
    expect(valuesMatch({ ...singleInput, op: OPS.NOTINCALL })).toBe(true);

    const arrayInput = {
      input: ['test1', 'test2'],
      toMatch: ['test3', 'test4'],
      op: OPS.INCALL,
      matchExact: true,
    };
    expect(valuesMatch(arrayInput)).toBe(false);
    expect(valuesMatch({ ...arrayInput, op: OPS.NOTINCALL })).toBe(true);
  });

  it('should match "incAll" when all regex in toMatch array matches input array (complex matcher)', () => {
    const singleInput = {
      input: 'test1',
      toMatch: [
        { type: 'RegexPattern' as const, pattern: 'test\\d+' },
        { type: 'RegexPattern' as const, pattern: 'test.' },
      ],
      op: OPS.INCALL,
    };
    expect(valuesMatch(singleInput)).toBe(true);
    expect(valuesMatch({ ...singleInput, op: OPS.NOTINCALL })).toBe(false);

    const arrayInput = {
      input: ['test1', 'test2'],
      toMatch: [
        { type: 'RegexPattern' as const, pattern: 'test\\d+' },
        { type: 'RegexPattern' as const, pattern: 'test.' },
      ],
      op: OPS.INCALL,
    };
    expect(valuesMatch(arrayInput)).toBe(true);
    expect(valuesMatch({ ...arrayInput, op: OPS.NOTINCALL })).toBe(false);
  });

  it('should match "notIncAll" when only some of the regex in toMatch array matches input array (complex matcher)', () => {
    const singleInput = {
      input: 'test1',
      toMatch: [
        { type: 'RegexPattern' as const, pattern: 'test\\d+' },
        { type: 'RegexPattern' as const, pattern: 'dtest' },
      ],
      op: OPS.INCALL,
    };
    expect(valuesMatch(singleInput)).toBe(false);
    expect(valuesMatch({ ...singleInput, op: OPS.NOTINCALL })).toBe(true);

    const arrayInput = {
      input: ['test1', 'test'],
      toMatch: [
        { type: 'RegexPattern' as const, pattern: 'test\\d+' },
        { type: 'RegexPattern' as const, pattern: 'dtest.' },
      ],
      op: OPS.INCALL,
    };
    expect(valuesMatch(arrayInput)).toBe(false);
    expect(valuesMatch({ ...arrayInput, op: OPS.NOTINCALL })).toBe(true);
  });
});
