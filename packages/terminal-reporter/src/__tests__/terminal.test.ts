import { describe, expect, it } from 'vitest';
import { createTerminalReporter } from '../terminal';

function fakeStream(isTTY: boolean) {
  const out: string[] = [];
  const stream = {
    isTTY,
    columns: 60,
    rows: 20,
    write: (s: string) => out.push(s),
  };
  return { out, stream: stream as unknown as NodeJS.WriteStream };
}

describe('createTerminalReporter', () => {
  it('writes only the summary when not a TTY', () => {
    const { out, stream } = fakeStream(false);
    const view = createTerminalReporter({ stream, now: () => 0 });
    view.push({ type: 'runBegin', totalTests: 1, startedAt: 0 });
    view.push({
      type: 'testBegin',
      testId: 'a',
      title: ['t'],
      file: 'f',
      worker: '0',
      retry: 0,
    });
    expect(out).toEqual([]);
    view.push({
      type: 'testEnd',
      testId: 'a',
      status: 'passed',
      durationMs: 1,
      retry: 0,
    });
    view.push({ type: 'runEnd', status: 'passed' });
    expect(out.join('')).toContain('Run passed');
    expect(out.join('')).not.toContain('\x1b[');
  });

  it('redraws in place on a TTY and restores the cursor', () => {
    const { out, stream } = fakeStream(true);
    const view = createTerminalReporter({ stream, now: () => 0, color: false });
    view.push({ type: 'runBegin', totalTests: 1, startedAt: 0 });
    view.push({
      type: 'testBegin',
      testId: 'a',
      title: ['t'],
      file: 'f',
      worker: '0',
      retry: 0,
    });
    view.push({ type: 'runEnd', status: 'cancelled' });
    const written = out.join('');
    expect(written.startsWith('\x1b[?25l')).toBe(true);
    expect(written).toMatch(/\x1b\[\d+F\x1b\[0J/);
    expect(written.endsWith('\x1b[?25h')).toBe(true);
    view.push({ type: 'runBegin', totalTests: 1, startedAt: 0 });
    expect(out.join('')).toBe(written);
  });
});
