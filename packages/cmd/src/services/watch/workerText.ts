import { dim, green } from '@logger';
import type { RunWorkerStats, WorkerStats } from './workerStats';

const BAR_WIDTH = 20;
/** The bar width in the layout used when one row per worker does not fit. */
const GRID_BAR_WIDTH = 10;

/**
 * A few lines about the workers of a run: their number, how busy they were
 * on average, and the busiest and the most idle worker.
 */
export function workerSummaryLines(stats: RunWorkerStats): string[] {
  const { workers, windowMs } = stats;
  if (!workers.length || !windowMs) return [];
  const label = workerLabel(workers);
  const lines = [
    `${workers.length} ${workers.length === 1 ? 'worker' : 'workers'}, ${formatDuration(windowMs)} from the first test to the last, busy ${percent(averageBusyMs(workers), windowMs)} of the time on average`,
  ];
  if (workers.length > 1) {
    const busiest = maxBy(workers, (w) => w.busyMs);
    const mostIdle = maxBy(workers, (w) => w.idleMs);
    lines.push(`Busiest: ${workerLine(busiest, label)}`);
    lines.push(`Most idle: ${workerLine(mostIdle, label)}`);
  }
  return lines;
}

/**
 * The run totals and one row per worker, cut to fit `columns` and `rows`.
 * When one row per worker does not fit, several workers share a row and the
 * running test is left out.
 */
export function workerTableLines(
  stats: RunWorkerStats,
  {
    columns,
    rows,
    now = Date.now(),
  }: { columns: number; rows: number; now?: number }
): string[] {
  const { workers, windowMs } = stats;
  const label = workerLabel(workers);
  const labelWidth = Math.max(0, ...workers.map((w) => label(w).length));
  const lines = [fit(totalsLine(stats), columns)];
  const space = rows - lines.length;

  if (workers.length <= space) {
    workers.forEach((w) => {
      const head = `${label(w).padEnd(labelWidth)} ${bar(w.busyMs, windowMs, BAR_WIDTH)} ${percent(w.busyMs, windowMs).padStart(4)} ${String(w.tests).padStart(3)} ${w.tests === 1 ? 'test ' : 'tests'}  `;
      // After the run ends every worker is idle, so the row says nothing more.
      const tail = w.running
        ? `${runningTitle(w.running)} ${formatDuration(Math.max(0, now - w.running.startedAt))}`
        : stats.runStatus
          ? ''
          : 'idle';
      const text = fit(`${head}${tail}`.trimEnd(), columns);
      lines.push(colorBar(text, labelWidth + 1, BAR_WIDTH, !!w.running));
    });
    return lines;
  }

  // Label, bar, percentage, test count and two spaces before the next worker.
  const cellWidth = labelWidth + GRID_BAR_WIDTH + 12;
  const perRow = Math.max(1, Math.floor(columns / cellWidth));
  // When not all fit, the last row says how many are left out.
  const shown =
    workers.length > perRow * space
      ? workers.slice(0, perRow * Math.max(0, space - 1))
      : workers;
  for (let i = 0; i < shown.length; i += perRow) {
    lines.push(
      shown
        .slice(i, i + perRow)
        .map((w) => {
          const text = `${label(w).padEnd(labelWidth)} ${bar(w.busyMs, windowMs, GRID_BAR_WIDTH)} ${percent(w.busyMs, windowMs).padStart(4)} ${String(w.tests).padStart(3)}`;
          return colorBar(
            fit(text, cellWidth - 2).padEnd(cellWidth),
            labelWidth + 1,
            GRID_BAR_WIDTH,
            !!w.running
          );
        })
        .join('')
    );
  }
  if (shown.length < workers.length) {
    lines.push(dim(`… ${workers.length - shown.length} more workers`));
  }
  return lines;
}

/** Shows only the parallel index when all workers run on one machine. */
function workerLabel(workers: WorkerStats[]) {
  const oneMachine = new Set(workers.map((w) => w.machineId)).size <= 1;
  return (w: WorkerStats) =>
    oneMachine ? `worker ${w.parallelIndex}` : w.worker;
}

function totalsLine(stats: RunWorkerStats) {
  const busyNow = stats.workers.filter((w) => w.running).length;
  const parts = [
    `${stats.testsDone} of ${stats.totalTests} tests done`,
    stats.testsFailed ? `${stats.testsFailed} failed` : undefined,
    `${busyNow} of ${stats.workers.length} workers busy`,
    formatDuration(stats.windowMs),
    stats.workers.length
      ? `busy ${percent(averageBusyMs(stats.workers), stats.windowMs)} on average`
      : undefined,
  ].filter(Boolean);
  const status = stats.runStatus ? `Run ${stats.runStatus}: ` : '';
  return `${status}${parts.join(', ')}`;
}

function workerLine(w: WorkerStats, label: (w: WorkerStats) => string) {
  return `${label(w)}, ${w.tests} ${w.tests === 1 ? 'test' : 'tests'}, busy ${formatDuration(w.busyMs)}, idle ${formatDuration(w.idleMs)}`;
}

function runningTitle(test: NonNullable<WorkerStats['running']>) {
  const project = test.project ? `[${test.project}] ` : '';
  const retry = test.retry > 0 ? ` (retry ${test.retry})` : '';
  return `${project}${[test.file, ...test.title].join(' › ')}${retry}`;
}

function averageBusyMs(workers: WorkerStats[]) {
  return workers.reduce((sum, w) => sum + w.busyMs, 0) / workers.length;
}

function bar(busyMs: number, windowMs: number, width: number) {
  const filled = windowMs
    ? Math.min(width, Math.round((busyMs / windowMs) * width))
    : 0;
  return '█'.repeat(filled) + '░'.repeat(width - filled);
}

/** Colors the bar of a row cut by `fit`, which leaves the bar in place. */
function colorBar(text: string, start: number, width: number, busy: boolean) {
  const barText = text.slice(start, start + width);
  const color = busy ? green : dim;
  return `${text.slice(0, start)}${color(barText)}${text.slice(start + width)}`;
}

function percent(part: number, whole: number) {
  return `${whole ? Math.round((part / whole) * 100) : 0}%`;
}

export function formatDuration(ms: number) {
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = String(seconds % 60).padStart(2, '0');
  if (minutes < 60) return `${minutes}m${rest}s`;
  return `${Math.floor(minutes / 60)}h${String(minutes % 60).padStart(2, '0')}m`;
}

export function fit(text: string, columns: number) {
  return text.length > columns
    ? `${text.slice(0, Math.max(0, columns - 1))}…`
    : text;
}

function maxBy<T>(items: T[], value: (item: T) => number) {
  return items.reduce((best, item) =>
    value(item) > value(best) ? item : best
  );
}
