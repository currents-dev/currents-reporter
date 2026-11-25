import type { MachineCountEstimate } from './machineCount';
import type { RunCost } from './runCost';
import { formatDuration } from './workerText';

export function costSoFarLine(cost: RunCost) {
  return `Cost so far: ${usd(cost.costUsd)} on ${machines(cost.machines)}, ${usd(cost.idleCostUsd)} of it idle`;
}

export function runCostLine(cost: RunCost) {
  return `This run cost ${usd(cost.costUsd)} on ${machines(cost.machines)}, ${usd(cost.idleCostUsd)} of it idle.`;
}

/**
 * `runWallMs` is the time the run took from the start of its first test to
 * the end of its last one. Other machine counts are compared to the estimate
 * for the machine count of the run, not to `runWallMs`, so that both sides
 * leave out the same time.
 */
export function machineCountLines(
  estimate: MachineCountEstimate,
  runWallMs: number
): string[] {
  const { fewer, more, currentMs } = estimate;
  const unit = estimate.unit === 'spec' ? 'spec file' : 'test';
  const workers = `${estimate.workersPerMachine} ${estimate.workersPerMachine === 1 ? 'worker' : 'workers'}`;
  const lines = [
    `Estimated wall time on other machine counts, from the test durations of this run (${workers} per machine):`,
    `  ${machines(estimate.machines)}, as in this run: about ${formatDuration(currentMs)} (the run took ${formatDuration(runWallMs)})`,
  ];
  if (runWallMs > currentMs * 1.25) {
    lines.push(
      `  The run took ${formatDuration(runWallMs - currentMs)} longer than this estimate, which spreads the tests evenly over the machines`
    );
  }
  if (fewer) {
    lines.push(
      `  Same wall time (±10%) on ${machines(fewer.machines)} instead of ${estimate.machines}`
    );
  }
  if (more) {
    lines.push(
      `  ${machines(more.machines)}: about ${formatDuration(more.wallMs)} instead of ${formatDuration(currentMs)}`
    );
    if (more.wallMs <= estimate.longestUnitMs * 1.05) {
      lines.push(
        `  No machine count gets below ${formatDuration(estimate.longestUnitMs)}, the time of the longest ${unit}`
      );
    }
  } else if (currentMs <= estimate.longestUnitMs * 1.1) {
    lines.push(
      `  More machines would not make it faster: the longest ${unit} takes ${formatDuration(estimate.longestUnitMs)}`
    );
  } else if (estimate.mostMachinesTried <= estimate.machines) {
    lines.push(
      `  More machines would not make it faster: the run has ${estimate.units} ${unit}s`
    );
  } else {
    lines.push(
      `  Up to ${machines(estimate.mostMachinesTried)} would not make it 10% faster`
    );
  }
  lines.push(
    estimate.unit === 'spec'
      ? '  Assumes whole spec files move between machines, as with orchestration. Start-up time and time between tests are left out.'
      : '  Assumes single tests move between machines, as in this run. Start-up time and time between tests are left out.'
  );
  return lines;
}

function usd(amount: number) {
  return `$${amount.toFixed(2)}`;
}

function machines(count: number) {
  return `${count} ${count === 1 ? 'machine' : 'machines'}`;
}
