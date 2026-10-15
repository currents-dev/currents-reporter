import { describe, expect, it } from 'vitest';
import {
  equals,
  exists,
  includes,
  includesAll,
  matches,
  matchesSome,
  within,
} from '../predicates';

describe('predicates', () => {
  describe('exists', () => {
    it('should return true for non-empty array', () => {
      expect(exists([1, 2, 3])).toBe(true);
    });

    it('should return false for empty array', () => {
      expect(exists([])).toBe(false);
    });

    it('should return true for non-null/undefined primitive', () => {
      expect(exists(1)).toBe(true);
      expect(exists('test')).toBe(true);
      expect(exists(true)).toBe(true);
    });

    it('should return false for null or undefined', () => {
      expect(exists(null)).toBe(false);
      expect(exists(undefined)).toBe(false);
    });
  });

  describe('equals', () => {
    it('should return true for equal primitives', () => {
      expect(equals('test', 'test')).toBe(true);
    });

    it('should return false for non-equal primitives', () => {
      expect(equals('test', 'not-test')).toBe(false);
    });

    it('should return true for equal arrays', () => {
      expect(equals(['one', 'two', 'three'], ['one', 'two', 'three'])).toBe(
        true
      );
    });

    it('should return false for non-equal arrays', () => {
      expect(equals(['one', 'two', 'three'], ['one', 'two', 'four'])).toBe(
        false
      );
    });
  });

  describe('matches', () => {
    it('should return true for matching substring', () => {
      expect(matches('test', 'te')).toBe(true);
    });

    it('should return true for matching regex', () => {
      expect(
        matches('test', { type: 'RegexPattern' as const, pattern: 'te.*' })
      ).toBe(true);
    });

    it('should return false for non-matching substring', () => {
      expect(matches('test', 'no-match')).toBe(false);
    });

    it('should return false for non-matching regex', () => {
      expect(
        matches('test', { type: 'RegexPattern' as const, pattern: 'no-match' })
      ).toBe(false);
    });

    it('should return false for invalid regex', () => {
      expect(
        matches('test', { type: 'RegexPattern' as const, pattern: '(' })
      ).toBe(false);
    });

    it('should return true for matching substring arrays', () => {
      expect(matches(['test', 'example'], ['te', 'ex'])).toBe(true);
    });

    it('should return true for matching arrays', () => {
      expect(
        matches(
          ['test', 'example'],
          [
            { type: 'RegexPattern' as const, pattern: 'te.*' },
            { type: 'RegexPattern' as const, pattern: 'ex.*' },
          ]
        )
      ).toBe(true);
    });

    it('should return false for non-matching arrays', () => {
      expect(
        matches(
          ['test', 'example'],
          [
            { type: 'RegexPattern' as const, pattern: 'te.*' },
            { type: 'RegexPattern' as const, pattern: 'no-match' },
          ]
        )
      ).toBe(false);
    });

    it('should return false for non-matching substring arrays', () => {
      expect(matches(['test', 'example'], ['te', 'no-match'])).toBe(false);
    });

    it('should return true for DateRange when input within range', () => {
      expect(
        matches('2024-01-15T00:00:00.000Z', {
          type: 'DateRange',
          inclusive: true,
          start: new Date('2024-01-01T00:00:00.000Z'),
          end: new Date('2024-01-31T23:59:59.999Z'),
        })
      ).toBe(true);
    });

    it('should return false for DateRange when input outside range', () => {
      expect(
        matches('2024-02-01T00:00:00.000Z', {
          type: 'DateRange',
          inclusive: true,
          start: new Date('2024-01-01T00:00:00.000Z'),
          end: new Date('2024-01-31T23:59:59.999Z'),
        })
      ).toBe(false);
    });

    it('should return true for DateRange at boundaries', () => {
      const range = {
        type: 'DateRange' as const,
        inclusive: true,
        start: new Date('2024-01-01T00:00:00.000Z'),
        end: new Date('2024-01-31T23:59:59.999Z'),
      };
      expect(matches('2024-01-01T00:00:00.000Z', range)).toBe(true);
      expect(matches('2024-01-31T23:59:59.999Z', range)).toBe(true);
    });

    it('should return false for DateRange at boundaries when inclusive is false', () => {
      const range = {
        type: 'DateRange' as const,
        inclusive: false,
        start: new Date('2024-01-01T00:00:00.000Z'),
        end: new Date('2024-01-31T23:59:59.999Z'),
      };
      expect(matches('2024-01-01T00:00:00.000Z', range)).toBe(false);
    });

    it('should handle arrays of DateRange (all must match)', () => {
      const range1 = {
        type: 'DateRange' as const,
        inclusive: true,
        start: new Date('2024-01-01T00:00:00.000Z'),
        end: new Date('2024-02-01T00:00:00.000Z'),
      };
      const range2 = {
        type: 'DateRange' as const,
        inclusive: true,
        start: new Date('2023-12-01T00:00:00.000Z'),
        end: new Date('2024-12-31T23:59:59.999Z'),
      };
      expect(matches('2024-01-15T00:00:00.000Z', [range1, range2])).toBe(true);
      const nonOverlapping = {
        type: 'DateRange' as const,
        inclusive: true,
        start: new Date('2025-01-01T00:00:00.000Z'),
        end: new Date('2025-12-31T23:59:59.999Z'),
      };
      expect(
        matches('2024-01-15T00:00:00.000Z', [range1, nonOverlapping])
      ).toBe(false);
    });
  });

  describe('matchesSome', () => {
    it('should return true if any value matches', () => {
      expect(
        matchesSome(
          ['test', 'example'],
          [{ type: 'RegexPattern' as const, pattern: 'te.*' }]
        )
      ).toBe(true);
    });

    it('should true if a partial value matches', () => {
      expect(matchesSome(['test', 'example'], 'tes')).toBe(true);
    });

    it('should return false if no values match', () => {
      expect(matchesSome(['test', 'example'], 'no-match')).toBe(false);
    });

    it('should return true if any DateRange matches', () => {
      const jan = {
        type: 'DateRange' as const,
        inclusive: true,
        start: new Date('2024-01-01T00:00:00.000Z'),
        end: new Date('2024-01-31T23:59:59.999Z'),
      };
      const feb = {
        type: 'DateRange' as const,
        inclusive: true,
        start: new Date('2024-02-01T00:00:00.000Z'),
        end: new Date('2024-02-29T23:59:59.999Z'),
      };
      expect(matchesSome('2024-02-15T00:00:00.000Z', [jan, feb])).toBe(true);
    });

    it('should return false if no DateRange matches', () => {
      const jan = {
        type: 'DateRange' as const,
        inclusive: true,
        start: new Date('2024-01-01T00:00:00.000Z'),
        end: new Date('2024-01-31T23:59:59.999Z'),
      };
      const feb = {
        type: 'DateRange' as const,
        inclusive: true,
        start: new Date('2024-02-01T00:00:00.000Z'),
        end: new Date('2024-02-29T23:59:59.999Z'),
      };
      expect(matchesSome('2024-03-10T00:00:00.000Z', [jan, feb])).toBe(false);
    });
  });

  describe('includesAll', () => {
    it('should return true if all elements are included', () => {
      expect(includesAll(['test', 'example'], ['test', 'example'])).toBe(true);
    });

    it('should return false if not all elements are included', () => {
      expect(includesAll(['test', 'example'], ['test', 'no-match'])).toBe(
        false
      );
    });
  });

  describe('includes', () => {
    it('should return true if any element is included', () => {
      expect(includes(['test', 'example'], 'test')).toBe(true);
    });

    it('should return false if no elements are included', () => {
      expect(includes(['test', 'example'], 'no-match')).toBe(false);
    });
  });

  describe('within', () => {
    it('should return true if input is within toMatch', () => {
      expect(within('one', ['one', 'two', 'three'])).toBe(true);
    });

    it('should return false if input is not within toMatch', () => {
      expect(within('four', ['one', 'two', 'three'])).toBe(false);
    });

    it('should return true if array input is within toMatch', () => {
      expect(within(['one', 'two'], ['one', 'two', 'three'])).toBe(true);
    });

    it('should return false if array input is not within toMatch', () => {
      expect(within(['four', 'five'], ['one', 'two', 'three'])).toBe(false);
    });
  });
});

describe('matches with rule-like values', () => {
  it("should return false if input array doesn't match rule matcher value", () => {
    const matchesResult = matches(
      [
        '[BI Large Desktop]',
        'bi/ads/homepage.spec.js',
        'Homepage',
        'should have nativo ad',
      ],
      ['BI Slideshow ads and associated requests', 'should have an in post ad']
    );
    expect(matchesResult).toBe(false);
  });

  it('should return true if input array matches rule matcher value', () => {
    const matchesResult = matches(
      ['BI Slideshow ads and associated requests', 'should have an in post ad'],
      ['BI Slideshow ads and associated requests', 'should have an in post ad']
    );
    expect(matchesResult).toBe(true);
  });

  it('should return false if input array partially matches rule matcher value', () => {
    const matchesResult = matches(
      ['should have an in post ad'],
      ['BI Slideshow ads and associated requests', 'should have an in post ad']
    );
    expect(matchesResult).toBe(false);
  });

  it('should return true if input array matches rule matcher value but has more elements', () => {
    const matchesResult = matches(
      [
        'BI Slideshow ads and associated requests',
        'should have an in post ad',
        'test title',
      ],
      ['BI Slideshow ads and associated requests', 'should have an in post ad']
    );
    expect(matchesResult).toBe(true);
  });

  it('should return false if matcher value is not a subset of the input', () => {
    const matchesResult = matches('should have an in post ad', [
      'BI Slideshow ads and associated requests',
      'should have an in post ad',
    ]);
    expect(matchesResult).toBe(false);
  });

  it('should return true if the input is a string and rule matcher is a regex string with unescaped special characters, input contains chars from the regex', () => {
    const matchesResult = matches('any test title', {
      type: 'RegexPattern',
      pattern: 'any .* title',
    });
    expect(matchesResult).toBe(true);
  });

  it('should return false if the input is a string and rule matcher is a regex string with escaped special characters, the values are different', () => {
    const matchesResult = matches('any test title', [
      {
        type: 'RegexPattern',
        pattern: 'BI Slideshow ads and associated requests'.replace(
          /[.*+?^${}()|[\]\\]/g,
          '\\$&'
        ),
      },
      {
        type: 'RegexPattern',
        pattern: 'should have an in post ad'.replace(
          /[.*+?^${}()|[\]\\]/g,
          '\\$&'
        ),
      },
    ]);
    expect(matchesResult).toBe(false);
  });

  it('should return true if the input is a string and the rule matcher is a regex string with escaped special characters, the values are equivalent', () => {
    const matchesResult = matches(
      ['BI Slideshow ads and associated requests', 'should have an in post ad'],
      [
        {
          type: 'RegexPattern',
          pattern: 'BI Slideshow ads and associated requests'.replace(
            /[.*+?^${}()|[\]\\]/g,
            '\\$&'
          ),
        },
        {
          type: 'RegexPattern',
          pattern: 'should have an in post ad'.replace(
            /[.*+?^${}()|[\]\\]/g,
            '\\$&'
          ),
        },
      ]
    );
    expect(matchesResult).toBe(true);
  });
});
