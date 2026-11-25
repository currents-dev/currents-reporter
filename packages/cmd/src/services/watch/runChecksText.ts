import { yellow } from '@logger';
import type { FailureGroup } from './failureSpread';
import type { MachineWarning } from './machineChecks';
import type { RunCheckEvent } from './runChecks';

/** The lines `watch` prints for a run check event. */
export function runCheckLines(event: RunCheckEvent): string[] {
  switch (event.type) {
    case 'machineWarning':
      return machineWarningLines(event);
    case 'failureGroup':
      return [yellow(`! ${failureGroupText(event)}`)];
    case 'failureGroups':
      return [
        '',
        'Most common errors:',
        ...event.groups.map((group) => `  ${failureGroupText(group)}`),
      ];
  }
}

function machineWarningLines(warning: MachineWarning) {
  const facts: string[] = [];
  if (warning.failuresStandOut) {
    facts.push(
      `${warning.failedTests} of ${warning.tests} tests failed at least once vs ${percent(
        warning.otherFailureRate
      )} on ${plural(
        warning.otherMachines,
        'other machine'
      )} that ran the same spec files`
    );
  }
  if (warning.slow && warning.slowRatio) {
    facts.push(
      `its passed tests take ${warning.slowRatio.toFixed(
        1
      )}x as long as the same spec files on other machines`
    );
  }
  const lines = [
    yellow(
      `! machine ${warning.machineId}: ${facts.join(
        '; '
      )}; probably the machine, not the code`
    ),
  ];
  if (warning.sharedError) {
    lines.push(
      `  ${warning.sharedError.tests} of ${warning.allFailedTests} failed tests on it have the same error: ${warning.sharedError.message}`
    );
  } else if (warning.allFailedTests > 1) {
    lines.push(
      `  its ${warning.allFailedTests} failed tests have ${warning.errors} different errors`
    );
  }
  return lines;
}

function failureGroupText(group: FailureGroup) {
  const machines =
    group.machines === 1 ? 'on 1 machine' : `across ${group.machines} machines`;
  const span = group.spanMs ? ` in ${seconds(group.spanMs)}` : '';
  const location = group.firstLocation
    ? ` (first at ${group.firstLocation})`
    : '';
  return `same error on ${group.tests} tests ${machines}${span}: ${group.message}${location}`;
}

function percent(rate: number) {
  return `${Math.round(rate * 100)}%`;
}

function seconds(ms: number) {
  return `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)} s`;
}

function plural(count: number, word: string) {
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}
