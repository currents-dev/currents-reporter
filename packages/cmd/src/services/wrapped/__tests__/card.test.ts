import { describe, expect, it, vi } from 'vitest';
import { cardRows, formatDuration, renderCard, renderCardSvg } from '../card';
import type { RunFacts } from '../facts';

vi.mock('@logger', () => {
  const plain = (s: string) => s;
  return { bold: plain, cyan: plain, dim: plain };
});

const facts: RunFacts = {
  tests: { total: 130, passed: 116, failed: 2, flaky: 2, skipped: 10 },
  parallel: {
    workers: 30,
    testTimeMs: 3_993_092,
    wallMs: 156_981,
    savedMs: 3_836_111,
  },
  busiestWorker: {
    name: 'Worker 20',
    attempts: 5,
    timeMs: 156_000,
    share: 0.039,
  },
  longestTest: { title: 'cart scenario #1', durationMs: 37_100 },
  flakiestTest: {
    title: 'login scenario #2',
    failedAttempts: 1,
    failedMs: 33_447,
  },
  firstFailure: { title: 'billing <scenario> #4', afterMs: 25_700 },
  steps: {
    total: 2119,
    slowest: { title: 'run the scenario', durationMs: 14_841, runs: 12 },
  },
};

describe('formatDuration', () => {
  it.each([
    [850, '850 ms'],
    [14_841, '14.8 s'],
    [156_981, '2 min 37 s'],
    [300_000, '5 min'],
    [3_836_111, '1 h 4 min'],
    [7_200_000, '2 h'],
  ])('%d ms is %s', (ms, text) => expect(formatDuration(ms)).toBe(text));
});

describe('the card', () => {
  it('states each fact with its number', () => {
    const text = cardRows({ facts, runUrl: 'https://app.currents.dev/run/r1' })
      .map((row) => row.text)
      .filter(Boolean);
    expect(text).toEqual([
      'Run wrapped · 130 tests',
      '116 passed · 2 failed · 2 flaky · 10 skipped',
      'Time saved',
      '30 workers saved you 1 h 4 min',
      '1 h 7 min of tests in 2 min 37 s',
      'Hardest-working worker',
      'Worker 20: 3.9% of all test time',
      '5 tests in 2 min 36 s',
      'Longest test',
      'cart scenario #1',
      '37.1 s',
      'Flakiest test',
      'login scenario #2',
      'Failed 1 time before it passed, 33.4 s spent failing',
      'First failure',
      'billing <scenario> #4',
      'Failed 25.7 s into the run',
      'Slowest step',
      'run the scenario',
      '14.8 s, and it ran 12 times',
      'Steps',
      '2,119 steps ran',
      'https://app.currents.dev/run/r1',
    ]);
  });

  it('leaves out facts that are missing and says why the steps are', () => {
    const text = cardRows({
      facts: {
        tests: { total: 1, passed: 1, failed: 0, flaky: 0, skipped: 0 },
      },
      stepsNote: 'Steps not read: 900 attempts, more than 200',
    })
      .map((row) => row.text)
      .filter(Boolean);
    expect(text).toEqual([
      'Run wrapped · 1 test',
      '1 passed',
      'Steps not read: 900 attempts, more than 200',
    ]);
  });

  it('draws every line at the same width and shortens long titles', () => {
    const lines = renderCard(
      cardRows({
        facts: {
          ...facts,
          longestTest: { title: 'x'.repeat(80), durationMs: 1 },
        },
        runUrl: 'https://app.currents.dev/run/r1',
      })
    );
    expect(new Set(lines.map((line) => line.length)).size).toBe(1);
    expect(lines[0]).toHaveLength(60);
    expect(lines.join('\n')).toContain(`${'x'.repeat(53)}…`);
  });

  it('keeps a long run URL whole and widens the card', () => {
    const url = `https://app.example.com/run/${'r'.repeat(60)}`;
    const lines = renderCard(cardRows({ facts, runUrl: url }));
    expect(lines.join('\n')).toContain(url);
    expect(new Set(lines.map((line) => line.length)).size).toBe(1);
  });

  it('writes an SVG with the text escaped', () => {
    const svg = renderCardSvg(cardRows({ facts }));
    expect(svg).toMatch(/^<svg /);
    expect(svg).toContain('billing &lt;scenario&gt; #4');
    expect(svg).not.toContain('<scenario>');
  });
});
