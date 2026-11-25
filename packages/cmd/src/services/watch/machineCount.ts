import type { EndedAttempt } from './workerStats';

export type MachineCountEstimate = {
  /** What moves between machines in the estimate. */
  unit: 'spec' | 'test';
  machines: number;
  workersPerMachine: number;
  /** The estimate for the machine count of this run, the one to compare to. */
  currentMs: number;
  /** The fewest machines whose estimate is at most 10% over `currentMs`. */
  fewer?: { machines: number; wallMs: number };
  /** More machines that cut the estimate by at least 10%. */
  more?: { machines: number; wallMs: number };
  /** The longest unit on its own machine: no machine count finishes sooner. */
  longestUnitMs: number;
  /** Specs, or tests when `unit` is test. */
  units: number;
  /** The most machines estimated; more would be a guess. */
  mostMachinesTried: number;
};

/** Estimates within this share of each other count as the same wall time. */
const SAME_WALL_TIME = 0.1;

/**
 * Puts each duration, longest first, on the bin with the least load so far,
 * and returns the load of each bin.
 */
export function longestFirst(durations: number[], bins: number): number[] {
  const loads = new Array<number>(bins).fill(0);
  [...durations]
    .sort((a, b) => b - a)
    .forEach((duration) => {
      let least = 0;
      for (let i = 1; i < bins; i++) if (loads[i] < loads[least]) least = i;
      loads[least] += duration;
    });
  return loads;
}

/**
 * Wall time of `units` on `machines` machines of `workersPerMachine` workers.
 * A unit is the list of durations its workers run: units go to machines whole,
 * longest first, and then each machine puts their durations on its workers
 * the same way.
 */
export function estimateWallMs(
  units: number[][],
  machines: number,
  workersPerMachine: number
): number {
  const perMachine = Array.from({ length: machines }, () => [] as number[]);
  const loads = new Array<number>(machines).fill(0);
  [...units]
    .map((durations) => ({ durations, total: sum(durations) }))
    .sort((a, b) => b.total - a.total)
    .forEach(({ durations, total }) => {
      let least = 0;
      for (let i = 1; i < machines; i++) if (loads[i] < loads[least]) least = i;
      loads[least] += total;
      perMachine[least].push(...durations);
    });
  return Math.max(
    0,
    ...perMachine.map((durations) =>
      Math.max(0, ...longestFirst(durations, workersPerMachine))
    )
  );
}

/**
 * Estimates the wall time of this run's tests on other machine counts. When a
 * spec ran on more than one machine, the run moved tests between machines and
 * the estimate does too; otherwise whole specs move, as with orchestration.
 * Within a machine, tests move between workers when a spec ran on more than
 * one worker of a machine. Start-up time and time between tests are not in the
 * durations. Returns nothing when fewer than two units ran.
 */
export function estimateMachineCounts(
  attempts: EndedAttempt[]
): MachineCountEstimate | undefined {
  const workersByMachine = new Map<string, Set<number>>();
  const specs = new Map<
    string,
    { machines: Set<string>; workers: Set<string>; tests: Map<string, number> }
  >();
  attempts.forEach((a) => {
    addTo(workersByMachine, a.machineId, a.parallelIndex);
    const key = `${a.project ?? ''}\0${a.file}`;
    let spec = specs.get(key);
    if (!spec) {
      spec = { machines: new Set(), workers: new Set(), tests: new Map() };
      specs.set(key, spec);
    }
    spec.machines.add(a.machineId);
    spec.workers.add(`${a.machineId}/${a.parallelIndex}`);
    spec.tests.set(a.testId, (spec.tests.get(a.testId) ?? 0) + a.durationMs);
  });

  const specList = [...specs.values()];
  const testsMoveBetweenMachines = specList.some((s) => s.machines.size > 1);
  const testsMoveBetweenWorkers = specList.some(
    (s) => s.workers.size > s.machines.size
  );
  const units: number[][] = testsMoveBetweenMachines
    ? specList.flatMap((s) => [...s.tests.values()].map((ms) => [ms]))
    : specList.map((s) =>
        testsMoveBetweenWorkers
          ? [...s.tests.values()]
          : [sum([...s.tests.values()])]
      );
  if (units.length < 2) return undefined;

  const machines = workersByMachine.size;
  const workersPerMachine = Math.max(
    ...[...workersByMachine.values()].map((w) => w.size)
  );
  const estimate = (n: number) => estimateWallMs(units, n, workersPerMachine);
  const currentMs = estimate(machines);
  const longestUnitMs = Math.max(
    ...units.map((u) => Math.max(...longestFirst(u, workersPerMachine)))
  );

  let fewer: MachineCountEstimate['fewer'];
  // Packing longest first does not always get faster with each machine
  // added, so every count is tried.
  for (let n = 1; n < machines; n++) {
    const wallMs = estimate(n);
    if (wallMs <= currentMs * (1 + SAME_WALL_TIME)) {
      fewer = { machines: n, wallMs };
      break;
    }
  }

  // One run's durations say little about machine counts far from its own.
  const mostMachines = Math.min(
    units.length,
    Math.max(machines * 2, machines + 2)
  );
  const larger = range(machines + 1, mostMachines).map((n) => ({
    machines: n,
    wallMs: estimate(n),
  }));
  const fastest = Math.min(...larger.map((l) => l.wallMs));
  const more =
    fastest <= currentMs * (1 - SAME_WALL_TIME)
      ? larger.find((l) => l.wallMs <= fastest * (1 + SAME_WALL_TIME / 2))
      : undefined;

  return {
    unit: testsMoveBetweenMachines ? 'test' : 'spec',
    machines,
    workersPerMachine,
    currentMs,
    fewer,
    more,
    longestUnitMs,
    units: units.length,
    mostMachinesTried: mostMachines,
  };
}

function sum(values: number[]) {
  return values.reduce((total, v) => total + v, 0);
}

function range(from: number, to: number) {
  return Array.from({ length: Math.max(0, to - from + 1) }, (_, i) => from + i);
}

function addTo<K, V>(map: Map<K, Set<V>>, key: K, value: V) {
  const set = map.get(key) ?? new Set<V>();
  set.add(value);
  map.set(key, set);
}
