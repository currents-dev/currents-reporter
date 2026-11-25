import { EndedAttempts } from './endedAttempts';
import type { TerminalRunEvent } from './events';
import { FailureSpread, type FailureGroup } from './failureSpread';
import { MachineChecks, type MachineWarning } from './machineChecks';

const SUMMARY_GROUPS = 5;

/**
 * What `watch` finds out about a run from its events. These are not part of
 * `TerminalRunEvent`: the Playwright reporter does not produce them.
 */
export type RunCheckEvent =
  | ({ type: 'machineWarning' } & MachineWarning)
  | ({ type: 'failureGroup' } & FailureGroup)
  /** At the end of the run: the largest groups of tests that failed with the same error. */
  | { type: 'failureGroups'; groups: FailureGroup[] };

/** Runs the machine checks and the failure groups over the events of a run. */
export function createRunChecks(cwd?: string) {
  const attempts = new EndedAttempts();
  const machines = new MachineChecks();
  const spread = new FailureSpread(cwd);

  return (event: TerminalRunEvent): RunCheckEvent[] => {
    if (event.type === 'runEnd') {
      const groups = spread.top(SUMMARY_GROUPS);
      return groups.length ? [{ type: 'failureGroups', groups }] : [];
    }
    const attempt = attempts.add(event);
    if (!attempt) return [];
    const events: RunCheckEvent[] = machines
      .add(attempt)
      .map((warning) => ({ type: 'machineWarning', ...warning }));
    const group = spread.add(attempt);
    if (group) events.push({ type: 'failureGroup', ...group });
    return events;
  };
}
