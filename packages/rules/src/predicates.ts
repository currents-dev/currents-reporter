import _ from 'lodash';
import * as types from './types';
import safeRegex from 'safe-regex2';

type Primitive = string | boolean | number;

/**
 * Checks if the input exists and is not empty or false.
 *
 * @param input - The input value which can be a primitive, an array of primitives, undefined, or null.
 * @returns `true` if the input is a non-empty array or a non-null/undefined primitive, otherwise `false`.
 */
export const exists = (input: Primitive | Primitive[] | undefined | null) => {
  if (Array.isArray(input)) {
    return input.length > 0;
  }
  return !!input;
};

/**
 * Checks if the input value is equal to the value to match.
 * In the case of arrays, they must have the same elements
 *
 * @param input - The real value to be checked. It can be a primitive, an array of primitives, undefined, or null.
 * @param toMatch - The rule value to match against. It can be a string or an array of strings.
 * @returns A boolean indicating whether the input value is equal to the value to match.
 */
export const equals = (
  input: Primitive | Primitive[] | undefined | null,
  toMatch: types.ConditionPrimitiveValue | null
) => {
  if (Array.isArray(input) || Array.isArray(toMatch)) {
    return _.xor([input].flat(), [toMatch].flat()).length === 0;
  }
  return input === toMatch;
};

/**
 * Checks if the input matches the specified rule matcher value.
 *
 * If either is an array, then all elements of toMatch must be found in input
 *
 * @param input - The real input value to be matched. It can be a string, an array of strings, undefined, or null.
 * @param toMatch - The rule matcher value to match against. It can be a string|regex or an array of strings|regex. Strings are treated as partial matches
 * @returns A boolean indicating whether all the values in the toMatch array can be found in the input value(s).
 */
export const matches = (
  input: string | string[] | undefined | null,
  toMatch: types.RuleMatcherValue | types.ConditionComplexValue
): boolean => {
  if (Array.isArray(toMatch) || Array.isArray(input)) {
    const inputArray = [input].flat();
    const toMatchArray = [toMatch].flat();
    for (let i = 0, j = 0, missing = false; i < toMatchArray.length; ) {
      const match = matches(inputArray[j], toMatchArray[i]);
      if (match) {
        i++;
        j = 0;
        continue;
      }

      missing = missing || !match;
      if (j < inputArray.length) {
        j++;
      } else {
        if (missing) {
          return false;
        }
        j = 0;
        if (i < toMatchArray.length) {
          i++;
        }
      }
    }
    return true;
  }
  if (toMatch && typeof input === 'string') {
    if (typeof toMatch === 'string') {
      return input.includes(toMatch);
    }
    if (
      typeof toMatch === 'object' &&
      (toMatch as types.RegexPattern).type === 'RegexPattern'
    ) {
      try {
        if (!safeRegex((toMatch as types.RegexPattern).pattern)) {
          return false;
        }
        return new RegExp((toMatch as types.RegexPattern).pattern).test(input);
      } catch (error) {
        return false;
      }
    }
    if (
      typeof toMatch === 'object' &&
      (toMatch as types.DateRange).type === 'DateRange'
    ) {
      const { start, end, inclusive } = toMatch as types.DateRange;
      const d = new Date(input);
      return inclusive ? d >= start && d <= end : d > start && d < end;
    }
  }
  return equals(input, toMatch as types.ConditionPrimitiveValue | null);
};

/**
 * Checks if toMatch matches any of the values in input.
 *
 *
 * @param input - The input value(s) to be checked. It can be a string, an array of strings, undefined, or null.
 * @param toMatch - The rule value to match against. It can be a single value or an array of values. Strings are treated as partial matches.
 * @returns A boolean indicating whether any of the toMatch values can be found in the input value(s).
 */
export const matchesSome = (
  input: string | string[] | undefined | null,
  toMatch: types.RuleMatcherValue
): boolean => {
  if (Array.isArray(toMatch) || Array.isArray(input)) {
    const inputArray = [input].flat();
    const toMatchArray = [toMatch].flat();
    for (let i = 0, j = 0; i < toMatchArray.length; ) {
      if (matches(inputArray[j], toMatchArray[i])) {
        return true;
      }
      if (j < inputArray.length) {
        j++;
      } else {
        j = 0;
        if (i < toMatchArray.length) {
          i++;
        }
      }
    }
    return false;
  }
  return matches(input, toMatch);
};

/**
 * Checks if all elements in `toMatch` are included in `input`.
 *
 * like matches, but with only primitive value matching.
 *
 * @param input - The real input value which can be a string, an array of strings, undefined, or null.
 * @param toMatch - The value to match against the input. Can be a single string or an array of strings.
 * @returns A boolean indicating whether all the values in the toMatch array can be found in the input value(s).
 */
export const includesAll = (
  input: Primitive | Primitive[] | undefined | null,
  toMatch: types.ConditionPrimitiveValue | null
) => {
  const inputSet = new Set([input].flat());
  return [toMatch].flat().every((match) => inputSet.has(match as any));
};

/**
 * Checks if the `input` includes the `toMatch` value.
 *
 * like matchesSome, but with only primitive value matching.
 *
 * @param input - The real value or array of values to be checked. It can be a string, an array of strings, undefined, or null.
 * @param toMatch - The rule value to match against the `input`.
 * @returns A boolean indicating whether any of the toMatch values can be found in the input value(s).
 */
export const includes = (
  input: Primitive | Primitive[] | undefined | null,
  toMatch: types.ConditionPrimitiveValue | null
) => {
  const inputSet = new Set([input].flat());
  return [toMatch].flat().some((match) => inputSet.has(match as any));
};

/**
 * Checks if the input value is within the `toMatch` value.
 *
 * @param input - The value to check, if it is an array, the method falls back to the `includes` method.
 * @param toMatch - The value to match against, which can be a single value or an array of values. no regex support for strings, only primitive value matching.
 * @returns A boolean indicating whether the input value is within the toMatch value(s).
 */
export const within = (
  input: Primitive | Primitive[] | undefined | null,
  toMatch: types.ConditionPrimitiveValue | null
) => {
  // if input is an array then this should actually be an includes
  if (Array.isArray(input)) {
    return includes(input, toMatch);
  }
  return new Set([toMatch as any].flat()).has(input);
};
