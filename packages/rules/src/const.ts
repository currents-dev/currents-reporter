export const OPS = {
  EQ: 'eq',
  NEQ: 'neq',
  IN: 'in',
  NOTIN: 'notIn',
  ANY: 'any',
  EMPTY: 'empty',
  INC: 'inc',
  NOTINC: 'notInc',
  INCALL: 'incAll',
  NOTINCALL: 'notIncAll',
} as const;

export type OP = (typeof OPS)[keyof typeof OPS];

export const NEGATED_OPS = [
  OPS.EMPTY,
  OPS.NEQ,
  OPS.NOTIN,
  OPS.NOTINC,
  OPS.NOTINCALL,
];

export const ACTION_TYPE = {
  SKIP: 'skip',
  QUARANTINE: 'quarantine',
  TAG: 'tag',
} as const;

export type ACTION_TYPE = (typeof ACTION_TYPE)[keyof typeof ACTION_TYPE];
