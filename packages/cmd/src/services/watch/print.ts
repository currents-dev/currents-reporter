import { dim, green, red, yellow } from '@logger';
import type { TerminalRunEvent, TestEndStatus } from './events';

const SYMBOLS: Record<TestEndStatus, string> = {
  passed: green('✓'),
  failed: red('✗'),
  timedOut: red('✗'),
  flaky: yellow('~'),
  skipped: dim('-'),
};

/**
 * Prints one line per finished test and a summary at the end. It stands in
 * for a terminal view until there is one, and reads the same events.
 */
export function createLinePrinter(write: (line: string) => void) {
  const titles = new Map<string, string>();
  // The last result of each test: a retry replaces the result before it.
  const results = new Map<string, TestEndStatus>();

  return (event: TerminalRunEvent) => {
    switch (event.type) {
      case 'runBegin':
        write(dim(`Watching ${event.totalTests} tests`));
        break;
      case 'testBegin': {
        const project = event.project ? `[${event.project}] ` : '';
        titles.set(
          event.testId,
          `${project}${[event.file, ...event.title].join(' › ')}`
        );
        break;
      }
      case 'testEnd': {
        results.set(event.testId, event.status);
        const retry = event.retry > 0 ? ` (retry ${event.retry})` : '';
        const duration = dim(`${(event.durationMs / 1000).toFixed(1)}s`);
        write(
          `${SYMBOLS[event.status]} ${titles.get(event.testId) ?? event.testId}${retry} ${duration}`
        );
        const error = event.error?.split('\n').find((line) => line.trim());
        if (error && event.status !== 'passed')
          write(dim(`    ${error.trim()}`));
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
}
