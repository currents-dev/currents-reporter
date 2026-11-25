export type WorkerTime = {
  machineId: string;
  /** Time of the run window the worker ran no test. */
  idleMs: number;
};

export type RunCost = {
  machines: number;
  /** Machines times the run window. */
  machineMinutes: number;
  costUsd: number;
  /** The part of `costUsd` paid while workers ran no test. */
  idleCostUsd: number;
};

/**
 * Cost of the machines of a run at `pricePerMinute` per machine. Every machine
 * that ran a test is counted for the whole window, from the start of the first
 * test of the run to the end of the last one. A machine's idle time is the
 * mean idle time of its workers: with 4 workers, one idle worker makes a
 * quarter of the machine idle.
 */
export function runCost(
  workers: WorkerTime[],
  windowMs: number,
  pricePerMinute: number
): RunCost {
  const idleByMachine = new Map<string, number[]>();
  workers.forEach(({ machineId, idleMs }) => {
    const list = idleByMachine.get(machineId) ?? [];
    list.push(idleMs);
    idleByMachine.set(machineId, list);
  });
  let idleMs = 0;
  idleByMachine.forEach((list) => {
    idleMs += list.reduce((sum, ms) => sum + ms, 0) / list.length;
  });
  const machineMinutes = (idleByMachine.size * windowMs) / 60_000;
  return {
    machines: idleByMachine.size,
    machineMinutes,
    costUsd: machineMinutes * pricePerMinute,
    idleCostUsd: (idleMs / 60_000) * pricePerMinute,
  };
}
