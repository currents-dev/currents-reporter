import { dim, green, red, yellow } from '@logger';
import path from 'path';
import type {
  TerminalErrorDetail,
  TerminalRunEvent,
  TestEndStatus,
} from './events';

const SYMBOLS: Record<TestEndStatus, string> = {
  passed: green('✓'),
  failed: red('✗'),
  timedOut: red('✗'),
  flaky: yellow('~'),
  skipped: dim('-'),
};

/** Step categories Playwright uses for setup; their steps are printed only when they fail. */
const SETUP_CATEGORIES = new Set(['hook', 'fixture']);

const DETAIL_INDENT = '      ';

type PrintedStep = {
  testId: string;
  title: string;
  depth: number;
  /** A setup step, or a step inside one. */
  setup: boolean;
};

/**
 * Prints each test when it begins and ends, its steps as they begin, and the
 * details of an error when a step or a test fails. Tests that run at the same
 * time print their lines in between each other, so every step line starts
 * with its test's title. It stands in for a terminal view until there is one,
 * and reads the same events.
 */
export function createLinePrinter(
  write: (line: string) => void,
  cwd = process.cwd()
) {
  const titles = new Map<string, string>();
  const shortTitles = new Map<string, string>();
  const steps = new Map<string, PrintedStep>();
  // The error messages already printed for the running attempt of each test:
  // a failed expect fails each step around it with the same error.
  const printedErrors = new Map<string, Set<string>>();
  // The last result of each test: a retry replaces the result before it.
  const results = new Map<string, TestEndStatus>();

  const writeError = (
    testId: string,
    error: string | undefined,
    detail: TerminalErrorDetail | undefined
  ) => {
    if (!error?.trim()) return;
    const printed = printedErrors.get(testId) ?? new Set<string>();
    printedErrors.set(testId, printed);
    if (printed.has(error)) return;
    printed.add(error);
    const lines = error.split('\n');
    while (lines.length && !lines[0].trim()) lines.shift();
    lines.forEach((line) => write(`${DETAIL_INDENT}${line}`));
    if (detail?.location) {
      const file = path.isAbsolute(detail.location.file)
        ? path.relative(cwd, detail.location.file)
        : detail.location.file;
      write(dim(`${DETAIL_INDENT}at ${file}:${detail.location.line}`));
    }
    detail?.snippet
      ?.split('\n')
      .forEach((line) => write(`${DETAIL_INDENT}${line}`));
  };

  return (event: TerminalRunEvent) => {
    switch (event.type) {
      case 'runBegin':
        write(dim(`Watching ${event.totalTests} tests`));
        break;
      case 'testBegin': {
        const project = event.project ? `[${event.project}] ` : '';
        const retry = event.retry > 0 ? ` (retry ${event.retry})` : '';
        titles.set(
          event.testId,
          `${project}${[event.file, ...event.title].join(' › ')}`
        );
        shortTitles.set(
          event.testId,
          `${event.title[event.title.length - 1] ?? event.file}${retry}`
        );
        printedErrors.delete(event.testId);
        write(dim(`▸ ${titles.get(event.testId)}${retry}`));
        break;
      }
      case 'stepBegin': {
        const parent = event.parentStepId
          ? steps.get(event.parentStepId)
          : undefined;
        const step: PrintedStep = {
          testId: event.testId,
          title: event.title,
          depth: parent ? parent.depth + 1 : 0,
          setup: !!parent?.setup || SETUP_CATEGORIES.has(event.category ?? ''),
        };
        steps.set(event.stepId, step);
        if (!step.setup) write(stepLine(step, step.title));
        break;
      }
      case 'stepEnd': {
        const step = steps.get(event.stepId);
        if (!step || !event.error) break;
        const duration = dim(`${(event.durationMs / 1000).toFixed(1)}s`);
        write(stepLine(step, `${red('✗')} ${step.title} ${duration}`));
        writeError(event.testId, event.error, event.errorDetail);
        break;
      }
      case 'testEnd': {
        results.set(event.testId, event.status);
        const retry = event.retry > 0 ? ` (retry ${event.retry})` : '';
        const duration = dim(`${(event.durationMs / 1000).toFixed(1)}s`);
        write(
          `${SYMBOLS[event.status]} ${titles.get(event.testId) ?? event.testId}${retry} ${duration}`
        );
        if (event.status !== 'passed')
          writeError(event.testId, event.error, event.errorDetail);
        break;
      }
      case 'runEnd': {
        const counts: Record<TestEndStatus, number> = {
          passed: 0,
          failed: 0,
          timedOut: 0,
          flaky: 0,
          skipped: 0,
        };
        results.forEach((status) => (counts[status] += 1));
        const color = event.status === 'passed' ? green : red;
        write('');
        write(
          `${color(`Run ${event.status}`)}: ${counts.passed} passed, ${
            counts.failed + counts.timedOut
          } failed, ${counts.flaky} flaky, ${counts.skipped} skipped`
        );
        break;
      }
    }
  };

  function stepLine(step: PrintedStep, text: string) {
    const test = shortTitles.get(step.testId) ?? step.testId;
    return `  ${dim(`${test} ›`)} ${'  '.repeat(step.depth)}${text}`;
  }
}
