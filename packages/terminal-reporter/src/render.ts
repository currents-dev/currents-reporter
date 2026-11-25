import { finishedCount } from './reducer';
import type { TerminalRunState, TestState, TestStatus } from './types';

export type RenderOptions = {
  width: number;
  /** Rows available; the finished log shrinks to fit. */
  height: number;
  now: number;
  color: boolean;
};

const CODES = { red: 31, green: 32, yellow: 33, cyan: 36, dim: 2, bold: 1 };
type Paint = (style: keyof typeof CODES, text: string) => string;

const ICONS: Record<TestStatus, [string, keyof typeof CODES]> = {
  passed: ['✓', 'green'],
  failed: ['✗', 'red'],
  timedOut: ['✗', 'red'],
  flaky: ['~', 'yellow'],
  skipped: ['-', 'dim'],
};

/** Renders the run as terminal lines. Pure: no I/O, no clock. */
export function renderFrame(
  state: TerminalRunState,
  opts: RenderOptions
): string[] {
  const paint: Paint = (style, text) =>
    opts.color ? `\x1b[${CODES[style]}m${text}\x1b[0m` : text;
  const width = Math.max(opts.width, 20);
  const running = state.status === 'pending' || state.status === 'running';
  const top = header(state, opts, width, paint);
  if (!running) return [...top, '', ...summary(state, width, paint)];

  const workers = Object.entries(state.workers).map(([worker, testId]) =>
    workerRow(worker, testId ? state.tests[testId] : undefined, width, paint)
  );
  const fixed = top.length + workers.length + 3;
  const logRows = Math.max(opts.height - fixed, 0);
  const log = (logRows > 0 ? state.finished.slice(-logRows) : []).map((id) =>
    finishedRow(state.tests[id], width, paint)
  );
  return [...top, '', ...workers, ...(log.length ? ['', ...log] : [])];
}

function header(
  state: TerminalRunState,
  opts: RenderOptions,
  width: number,
  paint: Paint
): string[] {
  const done = finishedCount(state);
  const total = Math.max(state.totalTests, done);
  const { passed, failed, timedOut, flaky, skipped } = state.counts;
  const elapsed =
    state.startedAt !== undefined ? opts.now - state.startedAt : 0;
  const eta =
    done > 0 && done < total ? (elapsed / done) * (total - done) : undefined;
  const parts = [
    paint('bold', `${done}/${total}`),
    paint('green', `✓ ${passed}`),
    paint('red', `✗ ${failed + timedOut}`),
    paint('yellow', `~ ${flaky}`),
    paint('dim', `- ${skipped}`),
    paint('dim', formatDuration(elapsed)),
    ...(eta !== undefined ? [paint('dim', `eta ${formatDuration(eta)}`)] : []),
  ];
  const barWidth = Math.max(width - 7, 10);
  const filled = total ? Math.round((done / total) * barWidth) : 0;
  const pct = total ? Math.floor((done / total) * 100) : 0;
  const bar =
    paint(failed + timedOut ? 'red' : 'green', '█'.repeat(filled)) +
    paint('dim', '░'.repeat(barWidth - filled)) +
    ` ${String(pct).padStart(3)}%`;
  return [parts.join('  '), bar];
}

function workerRow(
  worker: string,
  test: TestState | undefined,
  width: number,
  paint: Paint
): string {
  const label = fit(worker, 8).padEnd(8);
  if (!test) return `${paint('dim', label)} ${paint('dim', 'idle')}`;
  const step = test.steps[test.steps.length - 1];
  const name = fit(testName(test), Math.floor((width - 9) * 0.6));
  const rest = width - 9 - name.length - 3;
  const stepText = step && rest > 3 ? ` › ${fit(step.title, rest)}` : '';
  return `${paint('cyan', label)} ${name}${paint('dim', stepText)}`;
}

function finishedRow(test: TestState, width: number, paint: Paint): string {
  const [icon, style] = ICONS[test.status as TestStatus];
  const time = formatDuration(test.durationMs ?? 0);
  const name = fit(testName(test), width - time.length - 4);
  return `${paint(style, icon)} ${name} ${paint('dim', time)}`;
}

function summary(
  state: TerminalRunState,
  width: number,
  paint: Paint
): string[] {
  const failures = state.finished
    .map((id) => state.tests[id])
    .filter((t) => t.status === 'failed' || t.status === 'timedOut');
  const ok = state.status === 'passed';
  const lines = [
    paint(ok ? 'green' : 'red', paint('bold', `Run ${state.status}`)),
  ];
  for (const test of failures) {
    lines.push(finishedRow(test, width, paint));
    const error = test.error?.split('\n').find((l) => l.trim());
    if (error) lines.push(paint('dim', `  ${fit(error.trim(), width - 2)}`));
    if (test.testUrl) lines.push(paint('dim', `  ${test.testUrl}`));
  }
  if (state.runUrl) lines.push('', state.runUrl);
  return lines;
}

function testName(test: TestState) {
  const project = test.project ? `[${test.project}] ` : '';
  const retry = test.retry > 0 ? ` (retry ${test.retry})` : '';
  return `${project}${[test.file, ...test.title].join(' › ')}${retry}`;
}

/** Truncates plain text to `width` columns. Wide characters count as one. */
export function fit(text: string, width: number): string {
  if (width <= 0) return '';
  const flat = text.replace(/\s+/g, ' ');
  return flat.length <= width ? flat : `${flat.slice(0, width - 1)}…`;
}

export function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${(ms / 1000).toFixed(1)}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m${String(s % 60).padStart(2, '0')}s`;
  return `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}m`;
}
