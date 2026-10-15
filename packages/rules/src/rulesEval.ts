import { groupBy } from 'lodash';
import { NEGATED_OPS, OPS } from './const';
import * as pred from './predicates';
import {
  Action,
  ConditionComplexValue,
  ConditionPrimitiveValue,
  RuleActionType,
  RuleCondOperator,
  RuleMatchable,
  RuleMatcherCond,
} from './types';
import { normalizeTagMatcherValue } from './util';

/**
 * Determines if the given input matches the toMatch value(s) according to the provided operator.
 *
 * This function supports matching with both primitive values and complex matchers (such as regex patterns),
 * and handles matching logic for all supported operators like EQ, NEQ, IN, NOTIN, INC, NOTINC, INCALL, NOTINCALL, ANY, and EMPTY.
 *
 * @param {string | string[] | undefined | null} input - The value(s) to test for matching.
 * @param {ConditionPrimitiveValue | ConditionComplexValue[] | null} toMatch - The value(s) or patterns to match against.
 * @param {RuleCondOperator} op - The operator to use for matching.
 * @param {boolean} [matchExact] - If true, match using strict equality rules (exact matching) as long as the condition value is not a complex matcher.
 * @returns {boolean} True if the input matches according to the operator and provided values; otherwise false.
 */
export const valuesMatch = ({
  input,
  toMatch,
  op,
  matchExact,
}: {
  input: string | string[] | undefined | null;
  toMatch: ConditionPrimitiveValue | ConditionComplexValue[] | null;
  op: RuleCondOperator;
  matchExact?: boolean;
}): boolean => {
  const isComplex = usesComplexValues(toMatch);
  const primitiveMatch: ConditionPrimitiveValue | null = isComplex
    ? null
    : (toMatch as ConditionPrimitiveValue | null);
  const complexMatch: ConditionComplexValue[] = isComplex
    ? (toMatch as ConditionComplexValue[])
    : [];

  const exactMode = !!matchExact && !isComplex;
  const matchPreds = (() => {
    switch (op) {
      case OPS.ANY:
      case OPS.EMPTY:
        return pred.exists(input);
      case OPS.EQ:
      case OPS.NEQ:
        return exactMode
          ? pred.equals(input, primitiveMatch)
          : pred.matches(input, isComplex ? complexMatch : primitiveMatch);
      case OPS.IN:
      case OPS.NOTIN:
        return exactMode
          ? pred.within(input, primitiveMatch)
          : pred.matchesSome(input, isComplex ? complexMatch : primitiveMatch);
      case OPS.INC:
      case OPS.NOTINC:
        return exactMode
          ? pred.includes(input, primitiveMatch)
          : pred.matchesSome(input, isComplex ? complexMatch : primitiveMatch);
      case OPS.INCALL:
      case OPS.NOTINCALL:
        return exactMode
          ? pred.includesAll(input, primitiveMatch)
          : pred.matches(input, isComplex ? complexMatch : primitiveMatch);
      default:
        return false;
    }
  })();

  if (NEGATED_OPS.includes(op as any)) {
    return !matchPreds;
  }
  return matchPreds;
};

/**
 * Checks if the value uses complex values.
 *
 * @param value - The value to check if it uses complex values.
 * @returns A boolean indicating whether the value uses complex values.
 */
const usesComplexValues = (value: any): boolean => {
  if (value == null) return false;
  const arr = Array.isArray(value) ? value : [value];
  return arr.some((v) => typeof v === 'object' && v !== null && 'type' in v);
};

/**
 * Extracts the input value from a test object for the specified field.
 *
 * This function retrieves the field value used for rule matching from a RuleMatchable test instance.
 * It handles normalization and custom extraction logic for various field types.
 *
 * @param {RuleMatchable} test - The test object containing the data.
 * @param {string} field - The field name to extract from the test object.
 * @returns {{ input: string | string[] | undefined | null } | null} The extracted input or null if the field is not recognized.
 */
const extractTestInputForField = (
  test: RuleMatchable,
  field: string
): { input: string | string[] | undefined | null } | null => {
  switch (field) {
    case 'title':
    case 'titlePath':
    case 'file':
    case 'project':
    case 'testId': {
      return { input: test[field] };
    }
    case 'git_branch':
    case 'git_authorName':
    case 'git_authorEmail':
    case 'git_remoteOrigin':
    case 'git_message': {
      type GitInfoKey = keyof RuleMatchable['gitInfo'];
      return {
        input:
          test.gitInfo && test.gitInfo[field.replace('git_', '') as GitInfoKey],
      };
    }
    case 'tag': {
      return {
        input:
          test[field] !== undefined
            ? normalizeTagMatcherValue(test[field] as string[], {
                removeAtPrefix: true,
              })
            : undefined,
      };
    }
    case 'error_message': {
      return { input: test.errors?.map((e) => e.message) };
    }
    default:
      return null;
  }
};

/**
 * Extracts the matcher value for a given condition and field.
 *
 * This function retrieves the value used for rule matching from a RuleMatcherCond condition instance.
 * It handles normalization and custom extraction logic for various field types.
 *
 * @param {RuleMatcherCond} condition - The condition object containing the data.
 * @param {string} field - The field name to extract from the condition object.
 * @returns {{ toMatch: ConditionPrimitiveValue | ConditionComplexValue[]; exactMatches?: boolean } | null} The extracted matcher value or null if the condition is not recognized.
 */
const extractConditionsMatcherForField = (
  condition: RuleMatcherCond,
  field: string
): {
  toMatch: ConditionPrimitiveValue | ConditionComplexValue[];
  exactMatches?: boolean;
} | null => {
  if (condition.value == null) {
    return null;
  }
  switch (field) {
    case 'title':
    case 'titlePath':
    case 'file':
    case 'git_branch':
    case 'git_authorName':
    case 'git_authorEmail':
    case 'git_remoteOrigin':
    case 'git_message':
    case 'error_message': {
      return { toMatch: condition.value };
    }
    case 'project':
    case 'testId': {
      return { toMatch: condition.value, exactMatches: true };
    }
    case 'tag': {
      return {
        toMatch: normalizeTagMatcherValue(
          condition.value as ConditionPrimitiveValue,
          { removeAtPrefix: true }
        ),
        exactMatches: true,
      };
    }
    default:
      return null;
  }
};

export class RulesEvalBase {
  constructor(
    readonly rules: Action[],
    readonly _debug = (_fmt: string, ..._params: any) => {}
  ) {}

  /**
   * Matches a condition against a test object.
   *
   * This function checks if a given condition matches a test object based on the provided condition and test data.
   * It extracts the input value and matcher value from the test object, and then uses the valuesMatch function to determine if the condition matches.
   *
   * @param {RuleMatcherCond} condition - The condition object containing the data.
   * @param {RuleMatchable} test - The test object containing the data.
   * @returns {boolean} True if the condition matches the test object; otherwise false.
   */
  matchCondition(condition: RuleMatcherCond, test: RuleMatchable): boolean {
    const input = extractTestInputForField(test, condition.type);
    const matcher = extractConditionsMatcherForField(condition, condition.type);
    if (!input || !matcher) {
      return false;
    }
    const result = valuesMatch({
      ...input,
      toMatch: matcher.toMatch,
      op: condition.op,
      matchExact: matcher.exactMatches,
    });
    this._debug(
      'Check condition type %s : %O and got result %s',
      condition.type,
      condition.value,
      result
    );
    return result;
  }

  /**
   * Matches a rule against a test object.
   *
   * This function checks if a given rule matches a test object based on the provided rule and test data.
   * It extracts the input value and matcher value from the test object, and then uses the valuesMatch function to determine if the rule matches.
   *
   * @param {Action} rule - The rule object containing the data.
   * @param {RuleMatchable} test - The test object containing the data.
   * @returns {boolean} True if the rule matches the test object; otherwise false.
   */
  matchRule(rule: Action, test: RuleMatchable): boolean {
    this._debug('Check for rule match %j with test %O', rule, test);
    if (!rule.matcher || rule.matcher.cond.length === 0) {
      return false;
    }
    if (rule.matcher.op === 'AND') {
      return rule.matcher.cond.every((cond) => this.matchCondition(cond, test));
    } else if (rule.matcher.op === 'OR') {
      return rule.matcher.cond.some((cond) => this.matchCondition(cond, test));
    } else {
      return false;
    }
  }

  /**
   * Gets all rules that match a test object.
   *
   * This function filters the rules array to return only the rules that match a given test object.
   * It uses the matchRule function to determine if a rule matches the test object.
   *
   * @param {RuleMatchable} test - The test object containing the data.
   * @returns {Action[]} An array of rules that match the test object.
   */
  getMatchedRules(test: RuleMatchable): Action[] {
    return this.rules.filter((rule) => this.matchRule(rule, test));
  }

  /**
   * Gets all rules that match a test object grouped by their action type.
   *
   * This function filters the rules array to return only the rules that match a given test object,
   * and then groups the rules by their action type.
   *
   * @param {RuleMatchable} test - The test object containing the data.
   * @returns {Record<RuleActionType, Action[]>} An object with action types as keys and arrays of rules as values.
   */
  getMatchedRulesGroupedByType(
    test: RuleMatchable
  ): Record<RuleActionType, Action[]> {
    const matchedRules = this.rules.filter((rule) =>
      this.matchRule(rule, test)
    );
    return groupBy(matchedRules, (rule) => rule.action[0].op) as Record<
      RuleActionType,
      Action[]
    >;
  }

  /**
   * Gets all rules that match a test object for a specific action type.
   *
   * This function filters the rules array to return only the rules that match a given test object,
   * and then filters the rules by the specified action type.
   *
   * @param {RuleMatchable} test - The test object containing the data.
   * @param {RuleActionType} action - The action type to filter by.
   * @returns {Action[]} An array of rules that match the test object and the specified action type.
   */
  getMatchedRulesForAction(
    test: RuleMatchable,
    action: RuleActionType
  ): Action[] {
    return this.getMatchedRules(test).filter((rule) =>
      rule.action.some((a) => a.op === action)
    );
  }
}
