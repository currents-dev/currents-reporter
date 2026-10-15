import { ACTION_TYPE, OP } from './const';

export type RuleMatchableError = {
  message: string;
};

export type RuleMatchable = {
  title?: string;
  titlePath?: string[];
  project?: string;
  testId?: string;
  file?: string;
  tag?: string[];
  gitInfo?: null | {
    branch?: string | null;
    authorName?: string | null;
    authorEmail?: string | null;
    remoteOrigin?: string | null;
    message?: string | null;
  };
  errors?: RuleMatchableError[];
};

export type RuleSkipAction = {
  op: Extract<RuleActionType, 'skip'>;
  details?: null;
};
export type RuleQuarantineAction = {
  op: Extract<RuleActionType, 'quarantine'>;
  details?: null;
};

export type RuleTagAction = {
  op: Extract<RuleActionType, 'tag'>;
  details: {
    tags: string[];
  };
};

export type RuleAction = RuleSkipAction | RuleQuarantineAction | RuleTagAction;

export type RuleCombinator = 'AND' | 'OR';

export type RuleCondOperator = OP;
export type RuleActionType = ACTION_TYPE;

export type RegexPattern = {
  type: 'RegexPattern';
  pattern: string;
};

export type DateRange = {
  type: 'DateRange';
  inclusive: boolean;
  start: Date;
  end: Date;
};

export type ConditionComplexValue = RegexPattern | DateRange;
export type ConditionPrimitiveValue = string | string[];

export type RuleMatcherValue =
  | ConditionPrimitiveValue
  | ConditionComplexValue[]
  | null;

type RuleMatcherCondExactSingleValue = {
  op: Exclude<RuleCondOperator, 'inc' | 'notInc' | 'incAll' | 'notIncAll'>;
  value: Exclude<RuleMatcherValue, ConditionComplexValue[]>;
  type: 'testId' | 'project';
};

type RuleMatcherCondComplexSingleValue = {
  op: Exclude<RuleCondOperator, 'inc' | 'notInc' | 'incAll' | 'notIncAll'>;
  value: RuleMatcherValue;
  type:
    | 'title'
    | 'file'
    | 'git_branch'
    | 'git_authorName'
    | 'git_authorEmail'
    | 'git_remoteOrigin'
    | 'git_message';
};

type RuleMatcherCondComplexMultipleValue = {
  op: RuleCondOperator;
  value: RuleMatcherValue;
  type: 'error_message' | 'titlePath' | 'annotation';
};

type RuleMatcherCondExactMultipleValue = {
  op: RuleCondOperator;
  value: Exclude<RuleMatcherValue, ConditionComplexValue[]>;
  type: 'tag';
};

export type RuleMatcherCond =
  | RuleMatcherCondExactSingleValue
  | RuleMatcherCondComplexSingleValue
  | RuleMatcherCondComplexMultipleValue
  | RuleMatcherCondExactMultipleValue;

export type RuleMatcher = {
  cond: RuleMatcherCond[];
  op: RuleCombinator;
};

export type BaseAction = {
  v: number;
  name: string;
  description?: string | null;
  action: RuleAction[];
  matcher: RuleMatcher;
};

export type Action = BaseAction & {
  _id?: string;
  createdAt: Date;
  createdBy: string;
  updatedAt?: Date;
  updatedBy?: string;
  disabledAt?: Date;
  disabledBy?: string;
  archivedAt?: Date;
  archivedBy?: string;
  expiresAfter?: Date;
};

export type RuleTraceDetails = {
  v: number;
  id?: string;
  name: string;
  type: RuleActionType;
  extraDetails?: Record<string, any>;
  appliedAt: number;
};

export type RuleTrace = {
  rule: RuleTraceDetails;
  testInfo: Record<string, any>;
};
