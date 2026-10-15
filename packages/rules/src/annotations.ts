/**
 * Annotation types that record an action applied to a test. The dashboard
 * reads them to label a test as skipped, quarantined or tagged by an action.
 */
export const ACTION_ANNOTATIONS = {
  SKIP: '_currents:rule:skip',
  QUARANTINE: '_currents:rule:quarantine',
  TAG: '_currents:rule:tag',
  MATCH: '_currents:action:match',
  // The _POST types mark actions applied after the test ran
  SKIP_POST: '_currents:rule:skip-post',
  QUARANTINE_POST: '_currents:rule:quarantine-post',
} as const;

export type ACTION_ANNOTATIONS =
  (typeof ACTION_ANNOTATIONS)[keyof typeof ACTION_ANNOTATIONS];
