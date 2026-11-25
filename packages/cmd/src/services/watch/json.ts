import { stripVTControlCharacters } from 'util';
import type { TerminalErrorDetail, TerminalRunEvent } from './events';

/**
 * One event as a line of JSON, for `currents watch --json`. Playwright colours
 * error messages and snippets with ANSI codes; they are removed.
 */
export function toJsonLine(event: TerminalRunEvent) {
  if (event.type !== 'stepEnd' && event.type !== 'testEnd') {
    return JSON.stringify(event);
  }
  return JSON.stringify({
    ...event,
    error: event.error && stripVTControlCharacters(event.error),
    errorDetail: event.errorDetail && withoutColours(event.errorDetail),
  });
}

function withoutColours(detail: TerminalErrorDetail): TerminalErrorDetail {
  return {
    ...detail,
    snippet: detail.snippet && stripVTControlCharacters(detail.snippet),
  };
}
