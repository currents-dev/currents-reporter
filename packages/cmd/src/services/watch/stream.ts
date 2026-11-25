import { debug as _debug } from '@debug';
import { fetch } from 'undici';
import { getAuthHeaders } from '../../api/auth';
import { requireRestAPIBaseUrl } from '../../http/httpConfig';
import { getDispatcher } from '../../http/proxy';
import type { TestRecord } from './records';

const debug = _debug.extend('watch');

export type StreamRun = {
  status: string | null;
  completionState: string | null;
};

/** The events of `GET /stream/runs/:runId`, in the API's `runStream.route.ts`. */
export type RunStreamEvent =
  | { event: 'snapshot'; data: StreamRun & { records: TestRecord[] } }
  | { event: 'records'; data: { records: TestRecord[] } }
  | { event: 'runEnd'; data: StreamRun };

/** A response that retrying the same request will not change. */
export class RunStreamRefused extends Error {}

/**
 * Opens the event stream of a run and passes each event to `onEvent`.
 * Resolves when the server closes the stream: after `runEnd`, or when the
 * stream reaches its time limit and the client is expected to reconnect.
 */
export async function readRunStream(
  apiKey: string,
  runId: string,
  onEvent: (event: RunStreamEvent) => void,
  signal?: AbortSignal
) {
  const base = requireRestAPIBaseUrl();
  const url = new URL(
    `stream/runs/${encodeURIComponent(runId)}`,
    base.endsWith('/') ? base : `${base}/`
  );
  const res = await fetch(url, {
    headers: { Accept: 'text/event-stream', ...getAuthHeaders({ apiKey }) },
    dispatcher: getDispatcher(url.toString()),
    signal,
  });
  if (!res.ok || !res.body) {
    const message = await res.text().catch(() => '');
    const error = `Currents answered ${res.status} to the run stream${message ? `: ${message}` : ''}`;
    // 429 is the server's limit on open streams, and 5xx a passing failure.
    throw res.status === 429 || res.status >= 500
      ? new Error(error)
      : new RunStreamRefused(error);
  }

  let buffer = '';
  const decoder = new TextDecoder();
  for await (const chunk of res.body) {
    buffer += decoder.decode(chunk, { stream: true });
    let end: number;
    while ((end = buffer.indexOf('\n\n')) >= 0) {
      const block = buffer.slice(0, end);
      buffer = buffer.slice(end + 2);
      const event = parseEvent(block);
      if (event) onEvent(event);
    }
  }
}

/**
 * One server-sent event. Comment lines, such as the server's heartbeat, have
 * no event and are skipped.
 */
function parseEvent(block: string): RunStreamEvent | undefined {
  let name: string | undefined;
  const data: string[] = [];
  for (const line of block.split('\n')) {
    if (line.startsWith('event:')) name = line.slice(6).trim();
    else if (line.startsWith('data:')) data.push(line.slice(5).trimStart());
  }
  if (!name || data.length === 0) return undefined;
  debug('Run stream event: %s', name);
  return { event: name, data: JSON.parse(data.join('\n')) } as RunStreamEvent;
}
