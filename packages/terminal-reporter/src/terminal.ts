import { initialState, reduce } from './reducer';
import { renderFrame } from './render';
import type { TerminalRunEvent, TerminalRunState } from './types';

export type TerminalReporterOptions = {
  stream?: NodeJS.WriteStream;
  /** Redraws per second while running. */
  fps?: number;
  /** Defaults to on for a TTY unless NO_COLOR is set. */
  color?: boolean;
  now?: () => number;
};

export type TerminalReporter = {
  push(event: TerminalRunEvent): void;
  /** Draws the final frame and restores the cursor. Called on runEnd. */
  close(): void;
  getState(): TerminalRunState;
};

/**
 * Draws a live view of a run on a TTY. On a stream that is not a TTY it
 * writes only the final summary; callers decide whether to use it at all.
 */
export function createTerminalReporter(
  options: TerminalReporterOptions = {}
): TerminalReporter {
  const stream = options.stream ?? process.stdout;
  const now = options.now ?? Date.now;
  const tty = !!stream.isTTY;
  const color = options.color ?? (tty && !process.env.NO_COLOR);
  let state = initialState();
  let drawn = 0;
  let closed = false;
  let timer: NodeJS.Timeout | undefined;

  const draw = () => {
    const lines = renderFrame(state, {
      width: stream.columns ?? 80,
      height: stream.rows ?? 24,
      now: now(),
      color,
    }).slice(0, Math.max((stream.rows ?? 24) - 1, 1));
    // Move to the first line of the previous frame and clear below it.
    const up = drawn > 0 ? `\x1b[${drawn}F` : '';
    stream.write(`${up}\x1b[0J${lines.join('\n')}\n`);
    drawn = lines.length;
  };

  const showCursor = () => {
    process.off('exit', showCursor);
    stream.write('\x1b[?25h');
  };

  const close = () => {
    if (closed) return;
    closed = true;
    if (timer) clearInterval(timer);
    if (tty) {
      draw();
      showCursor();
    } else {
      stream.write(
        renderFrame(state, { width: 80, height: 0, now: now(), color })
          .join('\n')
          .concat('\n')
      );
    }
  };

  return {
    push(event) {
      if (closed) return;
      state = reduce(state, event);
      if (event.type === 'runEnd') return close();
      if (tty && !timer) {
        stream.write('\x1b[?25l');
        process.once('exit', showCursor);
        timer = setInterval(draw, 1000 / (options.fps ?? 10));
        timer.unref();
        draw();
      }
    },
    close,
    getState: () => state,
  };
}
