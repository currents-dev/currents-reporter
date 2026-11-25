import { bold, cyan, dim } from '@logger';
import type { RunFacts } from './facts';

/** Characters between the borders, without the side padding. */
const CONTENT_WIDTH = 54;
const PADDING = 2;

export type CardRow = {
  text: string;
  style: 'title' | 'heading' | 'value' | 'detail' | 'link' | 'blank';
};

export type CardInput = {
  facts: RunFacts;
  runUrl?: string;
  /** Why the step facts are missing, when they were not read. */
  stepsNote?: string;
};

/** The rows of the card, each at most `cardWidth(rows)` characters long. */
export function cardRows({ facts, runUrl, stepsNote }: CardInput): CardRow[] {
  const rows: CardRow[] = [];
  const add = (style: CardRow['style'], text = '') =>
    rows.push({ text: style === 'link' ? text : truncate(text), style });
  const fact = (heading: string, value: string, detail?: string) => {
    add('blank');
    add('heading', heading);
    add('value', value);
    if (detail) add('detail', detail);
  };

  const { tests } = facts;
  add('title', `Run wrapped · ${plural(tests.total, 'test')}`);
  add(
    'detail',
    [
      [tests.passed, 'passed'],
      [tests.failed, 'failed'],
      [tests.flaky, 'flaky'],
      [tests.skipped, 'skipped'],
    ]
      .filter(([count]) => count)
      .map(([count, label]) => `${count.toLocaleString('en-US')} ${label}`)
      .join(' · ')
  );

  if (facts.parallel) {
    const { workers, savedMs, testTimeMs, wallMs } = facts.parallel;
    fact(
      'Time saved',
      `${workers} workers saved you ${formatDuration(savedMs)}`,
      `${formatDuration(testTimeMs)} of tests in ${formatDuration(wallMs)}`
    );
  }
  if (facts.busiestWorker) {
    const { name, tests, timeMs, share } = facts.busiestWorker;
    fact(
      'Hardest-working worker',
      `${name}: ${formatShare(share)} of all test time`,
      `${plural(tests, 'test')} in ${formatDuration(timeMs)}`
    );
  }
  if (facts.longestTest) {
    fact(
      'Longest test',
      facts.longestTest.title,
      formatDuration(facts.longestTest.durationMs)
    );
  }
  if (facts.flakiestTest) {
    const { title, failedAttempts, failedMs } = facts.flakiestTest;
    fact(
      'Flakiest test',
      title,
      `Failed ${plural(failedAttempts, 'time')} before it passed, ${formatDuration(failedMs)} spent failing`
    );
  }
  if (facts.firstFailure) {
    fact(
      'First failure',
      facts.firstFailure.title,
      `Failed ${formatDuration(facts.firstFailure.afterMs)} into the run`
    );
  }
  if (facts.steps?.slowest) {
    const { title, durationMs, runs } = facts.steps.slowest;
    fact(
      'Slowest step',
      title,
      `${formatDuration(durationMs)}. Steps with this title ran ${plural(runs, 'time')}`
    );
  }
  if (facts.steps) {
    fact('Steps', `${facts.steps.total.toLocaleString('en-US')} steps ran`);
  } else if (stepsNote) {
    add('blank');
    add('detail', stepsNote);
  }

  if (runUrl) {
    add('blank');
    add('link', runUrl);
  }
  return rows;
}

/** The width of the text area: a run URL longer than the usual width makes the card wider. */
export function cardWidth(rows: CardRow[]) {
  return Math.max(CONTENT_WIDTH, ...rows.map((row) => length(row.text)));
}

const TERMINAL_STYLES: Record<CardRow['style'], (s: string) => string> = {
  title: (s) => bold(cyan(s)),
  heading: cyan,
  value: bold,
  detail: dim,
  link: cyan,
  blank: (s) => s,
};

/**
 * The card with box-drawing borders. It uses the terminal's own foreground,
 * bold, dim and cyan, which read on dark and light backgrounds.
 */
export function renderCard(rows: CardRow[]): string[] {
  const width = cardWidth(rows) + 2 * PADDING;
  const pad = ' '.repeat(PADDING);
  return [
    dim(`╭${'─'.repeat(width)}╮`),
    ...rows.map(
      (row) =>
        `${dim('│')}${pad}${TERMINAL_STYLES[row.style](row.text)}${' '.repeat(
          width - 2 * PADDING - length(row.text)
        )}${pad}${dim('│')}`
    ),
    dim(`╰${'─'.repeat(width)}╯`),
  ];
}

const SVG_FONT_SIZE = 15;
const SVG_LINE_HEIGHT = 22;
/** The advance of a monospace character at `SVG_FONT_SIZE`. */
const SVG_CHAR_WIDTH = 9;
const SVG_MARGIN = 28;
const SVG_STYLES: Record<CardRow['style'], string> = {
  title: 'fill="#38bdf8" font-weight="bold" font-size="20"',
  heading: 'fill="#38bdf8"',
  value: 'fill="#f1f5f9" font-weight="bold"',
  detail: 'fill="#94a3b8"',
  link: 'fill="#38bdf8"',
  blank: '',
};

/** The card as an SVG image with its own dark background, for sharing. */
export function renderCardSvg(rows: CardRow[]): string {
  const width = cardWidth(rows) * SVG_CHAR_WIDTH + 2 * SVG_MARGIN;
  const height = rows.length * SVG_LINE_HEIGHT + 2 * SVG_MARGIN;
  const lines = rows
    .map((row, i) =>
      row.style === 'blank'
        ? ''
        : `  <text x="${SVG_MARGIN}" y="${SVG_MARGIN + (i + 1) * SVG_LINE_HEIGHT - 6}" ${SVG_STYLES[row.style]}>${escapeXml(row.text)}</text>`
    )
    .filter(Boolean);
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" font-size="${SVG_FONT_SIZE}">`,
    `  <rect x="1" y="1" width="${width - 2}" height="${height - 2}" rx="16" fill="#0f172a" stroke="#334155" stroke-width="2"/>`,
    ...lines,
    '</svg>',
    '',
  ].join('\n');
}

/** "850 ms", "14.8 s", "2 min 37 s", "1 h 4 min". */
export function formatDuration(ms: number) {
  if (ms < 1000) return `${Math.round(ms)} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`;
  const seconds = Math.round(ms / 1000);
  if (seconds < 3600) {
    const s = seconds % 60;
    return `${Math.floor(seconds / 60)} min${s ? ` ${s} s` : ''}`;
  }
  const minutes = Math.round(seconds / 60);
  const m = minutes % 60;
  return `${Math.floor(minutes / 60)} h${m ? ` ${m} min` : ''}`;
}

function formatShare(share: number) {
  const percent = share * 100;
  return `${percent < 10 ? percent.toFixed(1) : Math.round(percent)}%`;
}

function plural(count: number, noun: string) {
  return `${count.toLocaleString('en-US')} ${noun}${count === 1 ? '' : 's'}`;
}

/** Counts code points, so that a character outside the BMP counts once. */
function length(text: string) {
  return [...text].length;
}

function truncate(text: string, max = CONTENT_WIDTH) {
  const chars = [...text];
  return chars.length > max ? `${chars.slice(0, max - 1).join('')}…` : text;
}

function escapeXml(text: string) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
