import { blue, bold, dim, green, red } from '@logger';
import { finishOrder, raceLanes } from './machineRace';
import {
  FAILED_RECENTLY_MS,
  type MachineState,
  type MachineStats,
  type RunMachineStats,
} from './machineStats';
import { fit, formatDuration } from './workerText';

type Size = { columns: number; rows: number; now?: number };

/** How long a heartbeat cell shows that a step or test just ended. */
const PULSE_MS = 1000;
/** The most characters of a machine ID that a view prints. */
const LABEL_WIDTH = 12;
const TILE_WIDTH = 38;
const TILE_GAP = 2;

const STATE_COLORS: Record<MachineState, (text: string) => string> = {
  running: green,
  idle: dim,
  failedRecently: red,
  done: blue,
};

/**
 * One cell per machine, colored by its state. While the run goes on, a cell
 * shows `◆` for a second after a step or test ended on its machine. When the cells with machine IDs
 * do not fit, the cells drop the IDs, and a line under them names the
 * machines where a test failed in the last `FAILED_RECENTLY_MS`.
 */
export function heartbeatLines(
  stats: RunMachineStats,
  { columns, rows, now = Date.now() }: Size
): string[] {
  const { machines } = stats;
  const lines = [fit(totalsLine(stats), columns), legendLine(columns)];
  const space = rows - lines.length;
  const labelWidth = Math.min(
    LABEL_WIDTH,
    Math.max(0, ...machines.map((m) => machineLabel(m).length))
  );
  const labeled = gridRows(machines.length, columns, labelWidth + 3);
  const cellWidth = labeled <= space ? labelWidth + 3 : 2;
  const perRow = Math.max(1, Math.floor(columns / cellWidth));
  const shown =
    machines.length > perRow * space
      ? machines.slice(0, perRow * Math.max(0, space - 1))
      : machines;
  for (let i = 0; i < shown.length; i += perRow) {
    lines.push(
      shown
        .slice(i, i + perRow)
        .map((m) => {
          const symbol =
            m.state !== 'done' &&
            m.lastActivityAt !== undefined &&
            now - m.lastActivityAt < PULSE_MS
              ? '◆'
              : '■';
          const text =
            cellWidth === 2
              ? symbol
              : `${symbol} ${shortLabel(m, labelWidth).padEnd(labelWidth)}`;
          return `${STATE_COLORS[m.state](text)} `;
        })
        .join('')
        .trimEnd()
    );
  }
  if (shown.length < machines.length) {
    lines.push(dim(`… ${machines.length - shown.length} more machines`));
  }
  const failing = machines.filter((m) => m.state === 'failedRecently');
  if (failing.length && lines.length < rows) {
    lines.push(
      red(
        fit(
          `Failed in the last ${FAILED_RECENTLY_MS / 1000}s: ${failing.map(machineLabel).join(', ')}`,
          columns
        )
      )
    );
  }
  return lines;
}

/**
 * One lane per machine, in the order of the machine IDs: its place by tests
 * done, how far it got through its tests, and its counts. See `raceLanes` for
 * how long a lane is.
 */
export function raceLines(
  stats: RunMachineStats,
  { columns, rows }: Size
): string[] {
  const lanes = raceLanes(stats);
  const lines = [fit(totalsLine(stats), columns)];
  const labelWidth = Math.min(
    LABEL_WIDTH,
    Math.max(0, ...stats.machines.map((m) => machineLabel(m).length))
  );
  const counts = lanes.map(({ machine, total }) => {
    const done =
      total !== undefined
        ? `${machine.testsDone} tests`
        : `${machine.testsDone} done`;
    return machine.testsFailed
      ? `${done}, ${machine.testsFailed} failed`
      : done;
  });
  const places = lanes.map(
    ({ machine }) =>
      lanes.filter((l) => l.machine.testsDone > machine.testsDone).length + 1
  );
  const placeWidth = String(lanes.length).length + 1;
  const countsWidth = Math.max(0, ...counts.map((c) => c.length));
  const track = Math.max(
    10,
    columns - placeWidth - labelWidth - countsWidth - 4
  );
  const space = rows - lines.length;
  const shown =
    lanes.length > space ? lanes.slice(0, Math.max(0, space - 1)) : lanes;
  shown.forEach(({ machine, position }, i) => {
    const at = Math.min(track - 1, Math.round(position * (track - 1)));
    const color = STATE_COLORS[machine.state];
    const label = shortLabel(machine, labelWidth).padEnd(labelWidth);
    const line = `${'━'.repeat(at)}●${' '.repeat(track - at - 1)}`;
    const place = `${places[i]}.`.padStart(placeWidth);
    const plain = `${place} ${label} ${line} ${counts[i]}`;
    lines.push(
      plain.length > columns
        ? fit(plain, columns)
        : `${place} ${label} ${color(line)} ${counts[i]}`
    );
  });
  if (shown.length < lanes.length) {
    lines.push(dim(`… ${lanes.length - shown.length} more machines`));
  }
  return lines;
}

/**
 * The machines that finished first and the one that finished last, with the
 * spec file it spent the most time on. Empty until the run ended.
 */
export function podiumLines(stats: RunMachineStats): string[] {
  if (!stats.runStatus) return [];
  const finishes = finishOrder(stats);
  if (finishes.length < 2) return [];
  const places = ['First', 'Second', 'Third'];
  const lines = finishes
    .slice(0, Math.min(3, finishes.length - 1))
    .map(
      (f, i) =>
        `${places[i]}: ${machineLabel(f.machine)} in ${formatDuration(f.finishedAfterMs)}`
    );
  const last = finishes[finishes.length - 1];
  const behind = last.finishedAfterMs - finishes[0].finishedAfterMs;
  const spec = last.machine.longestSpec;
  lines.push(
    `Slowest: ${machineLabel(last.machine)} in ${formatDuration(last.finishedAfterMs)}, ${formatDuration(behind)} after the first` +
      (spec
        ? `; its longest spec file: ${spec.file}, ${formatDuration(spec.durationMs)} of test time summed over its workers`
        : '')
  );
  return lines;
}

/**
 * One tile per machine: its tests, its failures, how fast its tests ran next
 * to the median machine, and the test it runs now.
 */
export function machineMapLines(
  stats: RunMachineStats,
  { columns, rows, now = Date.now() }: Size
): string[] {
  const lines = [fit(totalsLine(stats), columns)];
  const width = Math.min(TILE_WIDTH, columns);
  const perRow = Math.max(
    1,
    Math.floor((columns + TILE_GAP) / (width + TILE_GAP))
  );
  const tiles = stats.machines.map((m) => tileLines(m, width, now));
  const tileHeight = 3;
  // Each row of tiles is followed by an empty line.
  const fittingRows = Math.floor((rows - lines.length + 1) / (tileHeight + 1));
  const shownCount =
    tiles.length > fittingRows * perRow
      ? Math.max(0, fittingRows * perRow - 1)
      : tiles.length;
  for (let i = 0; i < shownCount; i += perRow) {
    if (i > 0) lines.push('');
    const row = tiles.slice(i, Math.min(i + perRow, shownCount));
    for (let line = 0; line < tileHeight; line++) {
      lines.push(
        row
          .map((tile) => tile[line])
          .join(' '.repeat(TILE_GAP))
          .trimEnd()
      );
    }
  }
  if (shownCount < tiles.length) {
    lines.push(dim(`… ${tiles.length - shownCount} more machines`));
  }
  return lines;
}

function tileLines(m: MachineStats, width: number, now: number): string[] {
  const color = STATE_COLORS[m.state];
  const state = STATE_LABELS[m.state];
  const label = fit(machineLabel(m), width - state.length - 1);
  const head = `${bold(label)}${' '.repeat(width - label.length - state.length)}${color(state)}`;
  const tests = `${m.testsDone} ${m.testsDone === 1 ? 'test' : 'tests'}`;
  const speed = relativeSpeed(m);
  const countsPlain = [tests, `${m.testsFailed} failed`, speed]
    .filter(Boolean)
    .join(', ');
  const countsText = [
    tests,
    m.testsFailed ? red(`${m.testsFailed} failed`) : '0 failed',
    speed,
  ]
    .filter(Boolean)
    .join(', ');
  const test = m.running[0];
  const current = test
    ? `▸ ${test.file} › ${test.title[test.title.length - 1] ?? ''}`
    : m.state === 'done' &&
        m.firstStartedAt !== undefined &&
        m.lastEndedAt !== undefined
      ? `ran tests for ${formatDuration(m.lastEndedAt - m.firstStartedAt)}`
      : 'no test running';
  const duration = test
    ? ` ${formatDuration(Math.max(0, now - test.startedAt))}`
    : '';
  const currentText = test
    ? `${fit(current, width - duration.length)}${dim(duration)}`
    : dim(current);
  return [
    head,
    countsPlain.length > width ? fit(countsPlain, width) : countsText,
    currentText,
  ].map((line) => padVisible(line, width));
}

const STATE_LABELS: Record<MachineState, string> = {
  running: 'running',
  idle: 'idle',
  failedRecently: 'recent failure',
  done: 'done',
};

/** How the machine's average test time compares with the median over all machines. */
function relativeSpeed(m: MachineStats) {
  const r = m.relativeTestTime;
  if (r === undefined) return '';
  if (Math.abs(r - 1) < 0.1) return 'median speed';
  return r > 1 ? `${r.toFixed(1)}x slower` : `${(1 / r).toFixed(1)}x faster`;
}

/** Compares the machine's average test time with the median over all machines. */
export function speedText(m: MachineStats) {
  if (m.averageTestMs === undefined) return 'no test ended yet';
  const average = `${formatDuration(m.averageTestMs)} a test`;
  const r = m.relativeTestTime;
  if (r === undefined || Math.abs(r - 1) < 0.1)
    return `${average}, as fast as the median`;
  return r > 1
    ? `${average}, ${r.toFixed(1)}x slower than median`
    : `${average}, ${(1 / r).toFixed(1)}x faster than median`;
}

/** Summary lines for the end of a run: machine counts, then the podium. */
export function machineSummaryLines(stats: RunMachineStats): string[] {
  const { machines } = stats;
  if (!machines.length) return [];
  const slowest = machines.reduce<MachineStats | undefined>(
    (best, m) =>
      (m.relativeTestTime ?? 0) > (best?.relativeTestTime ?? 0) ? m : best,
    undefined
  );
  const lines = [
    `${machines.length} ${machines.length === 1 ? 'machine' : 'machines'}`,
  ];
  if (machines.length > 1 && slowest) {
    lines.push(
      `Slowest tests: ${machineLabel(slowest)}, ${speedText(slowest)}`
    );
  }
  const failing = machines.filter((m) => m.testsFailed);
  if (failing.length) {
    lines.push(
      `Failed tests by machine: ${failing.map((m) => `${machineLabel(m)} ${m.testsFailed}`).join(', ')}`
    );
  }
  return [...lines, ...podiumLines(stats)];
}

function totalsLine(stats: RunMachineStats) {
  const byState = new Map<MachineState, number>();
  stats.machines.forEach((m) =>
    byState.set(m.state, (byState.get(m.state) ?? 0) + 1)
  );
  const states = (['running', 'idle', 'failedRecently'] as const)
    .filter((s) => byState.get(s))
    .map((s) =>
      s === 'failedRecently'
        ? `${byState.get(s)} with a recent failure`
        : `${byState.get(s)} ${STATE_LABELS[s]}`
    );
  const parts = [
    `${stats.testsDone} of ${stats.totalTests} tests done`,
    stats.testsFailed ? `${stats.testsFailed} failed` : undefined,
    `${stats.machines.length} ${stats.machines.length === 1 ? 'machine' : 'machines'}${states.length ? ` (${states.join(', ')})` : ''}`,
  ].filter(Boolean);
  const status = stats.runStatus ? `Run ${stats.runStatus}: ` : '';
  return `${status}${parts.join(', ')}`;
}

function legendLine(columns: number) {
  const items: [MachineState, string][] = [
    ['running', 'running'],
    ['idle', 'idle'],
    ['failedRecently', `failed in the last ${FAILED_RECENTLY_MS / 1000}s`],
    ['done', 'run ended'],
  ];
  const plain = `${items.map(([, t]) => `■ ${t}`).join('  ')}  ◆ a step or test just ended`;
  if (plain.length > columns) return dim(fit(plain, columns));
  return dim(
    `${items.map(([s, t]) => `${STATE_COLORS[s]('■')} ${t}`).join('  ')}  ◆ a step or test just ended`
  );
}

/** Rows needed for `count` cells of `cellWidth` in `columns`. */
function gridRows(count: number, columns: number, cellWidth: number) {
  return Math.ceil(count / Math.max(1, Math.floor(columns / cellWidth)));
}

/**
 * The machine ID as it can be printed: the ID is client input of any
 * characters, and a control character would break the redraw.
 */
export function machineLabel(m: MachineStats) {
  return m.machineId.replace(/[\x00-\x1f\x7f-\x9f]/g, '?');
}

/**
 * The end of the machine ID when it is longer than `width`: IDs set with
 * `CURRENTS_MACHINE_ID` often share a start, such as the CI job name.
 */
function shortLabel(m: MachineStats, width: number) {
  const label = machineLabel(m);
  return label.length > width ? `…${label.slice(-(width - 1))}` : label;
}

const ANSI = /\x1b\[[0-9;]*m/g;

function padVisible(text: string, width: number) {
  const visible = text.replace(ANSI, '').length;
  return visible < width ? `${text}${' '.repeat(width - visible)}` : text;
}
