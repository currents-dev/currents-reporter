import type { WorkerStatsTracker } from './workerStats';
import { workerTableLines } from './workerText';

const REDRAW_INTERVAL_MS = 250;

const HIDE_CURSOR = '\x1b[?25l';
const SHOW_CURSOR = '\x1b[?25h';
const CLEAR_TO_END = '\x1b[J';
/** Moves the cursor to the start of the line `n` lines up. */
const linesUp = (n: number) => (n > 0 ? `\x1b[${n}F` : '\r');

/**
 * Redraws the worker table in place on a terminal until `stop()`. The table
 * is cut to the terminal size: moving the cursor up cannot reach lines that
 * scrolled off the screen or wrapped.
 */
export function createWorkersView(
  stats: WorkerStatsTracker,
  out: NodeJS.WriteStream,
  /** Lines drawn under the table. */
  footerLines: () => string[] = () => []
) {
  let drawnLines = 0;
  let timer: NodeJS.Timeout | undefined;

  const draw = () => {
    const columns = out.columns || 80;
    const footer = footerLines().map((line) => line.slice(0, columns));
    const lines = [
      ...workerTableLines(stats.read(), {
        columns,
        // The last row stays empty for the cursor.
        rows: (out.rows || 24) - 1 - footer.length,
      }),
      ...footer,
    ];
    out.write(
      `${drawnLines ? linesUp(drawnLines) : ''}${CLEAR_TO_END}${lines.join('\n')}\n`
    );
    drawnLines = lines.length;
  };
  const onInterrupt = () => {
    out.write(SHOW_CURSOR);
    process.exit(130);
  };

  return {
    start() {
      out.write(HIDE_CURSOR);
      process.once('SIGINT', onInterrupt);
      draw();
      timer = setInterval(draw, REDRAW_INTERVAL_MS);
    },
    /** Draws the last frame and gives the terminal back. */
    stop() {
      if (!timer) return;
      clearInterval(timer);
      timer = undefined;
      draw();
      process.removeListener('SIGINT', onInterrupt);
      out.write(SHOW_CURSOR);
    },
  };
}
