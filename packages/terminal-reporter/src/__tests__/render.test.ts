import { describe, expect, it } from 'vitest';
import { initialState, reduce } from '../reducer';
import { fit, formatDuration, renderFrame } from '../render';
import type { TerminalRunEvent } from '../types';

const events: TerminalRunEvent[] = [
  {
    type: 'runBegin',
    totalTests: 4,
    startedAt: 0,
    runUrl: 'https://app/run/1',
  },
  {
    type: 'testBegin',
    testId: 'a',
    title: ['auth', 'logs in'],
    file: 'login.spec.ts',
    worker: '0',
    retry: 0,
  },
  { type: 'stepBegin', testId: 'a', stepId: 's', title: 'click "Submit"' },
  {
    type: 'testBegin',
    testId: 'b',
    title: ['pays'],
    file: 'cart.spec.ts',
    project: 'chromium',
    worker: '1',
    retry: 0,
  },
  {
    type: 'testEnd',
    testId: 'b',
    status: 'failed',
    durationMs: 3400,
    retry: 0,
    error: '\nExpected 1\nReceived 2',
    testUrl: 'https://app/test/b',
  },
];
const opts = { width: 80, height: 24, now: 10_000, color: false };
const state = events.reduce(reduce, initialState());

describe('renderFrame', () => {
  it('renders header, workers and finished log while running', () => {
    expect(renderFrame(state, opts)).toMatchInlineSnapshot(`
      [
        "1/4  ✓ 0  ✗ 1  ~ 0  - 0  10.0s  eta 30.0s",
        "██████████████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  25%",
        "",
        "0        login.spec.ts › auth › logs in › click "Submit"",
        "1        idle",
        "",
        "✗ [chromium] cart.spec.ts › pays 3.4s",
      ]
    `);
  });

  it('keeps rows within the width', () => {
    const lines = renderFrame(state, { ...opts, width: 30 });
    for (const line of lines.slice(1))
      expect(line.length).toBeLessThanOrEqual(30);
  });

  it('drops finished rows that do not fit the height', () => {
    expect(renderFrame(state, { ...opts, height: 6 })).toHaveLength(5);
  });

  it('renders the summary after runEnd', () => {
    const done = reduce(state, { type: 'runEnd', status: 'failed' });
    expect(renderFrame(done, opts).slice(3)).toEqual([
      'Run failed',
      '✗ [chromium] cart.spec.ts › pays 3.4s',
      '  Expected 1',
      '  https://app/test/b',
      '',
      'https://app/run/1',
    ]);
  });

  it('colors only when asked', () => {
    expect(renderFrame(state, opts).join('')).not.toContain('\x1b[');
    expect(renderFrame(state, { ...opts, color: true }).join('')).toContain(
      '\x1b[32m'
    );
  });
});

describe('helpers', () => {
  it('fit truncates with an ellipsis', () => {
    expect(fit('abcdef', 4)).toBe('abc…');
    expect(fit('a\nb', 5)).toBe('a b');
  });
  it('formatDuration', () => {
    expect(formatDuration(1500)).toBe('1.5s');
    expect(formatDuration(62_000)).toBe('1m02s');
    expect(formatDuration(3_720_000)).toBe('1h02m');
  });
});
