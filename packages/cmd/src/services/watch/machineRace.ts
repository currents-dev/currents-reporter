import type { MachineStats, RunMachineStats } from './machineStats';

export type RaceLane = {
  machine: MachineStats;
  /** How far the machine got, from 0 to 1. */
  position: number;
  /** The number of tests the lane is long, when it is the machine's own total. */
  total?: number;
};

/**
 * One lane per machine. The events say how many tests the run has, but not
 * how many each machine was given, so a machine's total is known only once
 * the run ended. Until then a lane is as long as an even share of the run's
 * tests, or as the most tests a machine has done when that is more.
 */
export function raceLanes(stats: RunMachineStats): RaceLane[] {
  const { machines, totalTests, runStatus } = stats;
  if (runStatus) {
    return machines.map((machine) => ({
      machine,
      position: machine.testsDone ? 1 : 0,
      total: machine.testsDone,
    }));
  }
  const evenShare = machines.length
    ? Math.ceil(totalTests / machines.length)
    : 0;
  const length = Math.max(evenShare, ...machines.map((m) => m.testsDone), 1);
  return machines.map((machine) => ({
    machine,
    position: machine.testsDone / length,
  }));
}

export type Finish = {
  machine: MachineStats;
  /** From the start of the first test of the run to the end of this machine's last test. */
  finishedAfterMs: number;
};

/** The machines that ended at least one test, the first to finish first. */
export function finishOrder(stats: RunMachineStats): Finish[] {
  const start = Math.min(
    ...stats.machines.flatMap((m) =>
      m.firstStartedAt !== undefined ? [m.firstStartedAt] : []
    )
  );
  return stats.machines
    .flatMap((machine) =>
      machine.lastEndedAt !== undefined
        ? [{ machine, finishedAfterMs: machine.lastEndedAt - start }]
        : []
    )
    .sort((a, b) => a.finishedAfterMs - b.finishedAfterMs);
}
