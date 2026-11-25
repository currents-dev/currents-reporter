import { debug as _debug } from '@debug';
import { getAuthHeaders } from '../../api/auth';
import { ClientType, getClient } from '../../http/client';
import type { RunEndStatus, TerminalRunEvent } from './events';
import { RecordEvents } from './records';
import { readRunStream, RunStreamRefused, type StreamRun } from './stream';

const debug = _debug.extend('watch');

/** Failed connections in a row before `watch` gives up. */
const MAX_FAILED_CONNECTIONS = 5;
/** The wait before reconnecting after the n-th failed connection in a row. */
const reconnectDelayMs = (failures: number) =>
  Math.min(1_000 * 2 ** failures, 15_000);

type RestRun = {
  createdAt: string;
  groups: { tests: { total: number } }[];
};

/**
 * Follows a run until it ends and passes its events to `emit`. The server
 * closes a stream after a few minutes; each new connection starts with a
 * snapshot of every record, of which `RecordEvents` reports only what changed.
 */
export async function watchRun(
  apiKey: string,
  runId: string,
  emit: (event: TerminalRunEvent) => void,
  sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
) {
  const run = await getRestRun(apiKey, runId);
  emit({
    type: 'runBegin',
    totalTests: run.groups.reduce((sum, g) => sum + g.tests.total, 0),
    startedAt: Date.parse(run.createdAt),
  });

  const records = new RecordEvents();
  let endStatus: RunEndStatus | undefined;
  let failures = 0;
  while (!endStatus) {
    let connected = false;
    try {
      await readRunStream(apiKey, runId, (message) => {
        connected = true;
        if (message.event === 'runEnd') {
          endStatus = runEndStatus(message.data);
        } else if (
          message.event === 'snapshot' ||
          message.event === 'records'
        ) {
          message.data.records.forEach((record) =>
            records.next(record).forEach(emit)
          );
        }
      });
      failures = 0;
    } catch (e) {
      if (e instanceof RunStreamRefused) throw e;
      // A stream that delivered events before failing starts the count again.
      failures = connected ? 1 : failures + 1;
      if (failures >= MAX_FAILED_CONNECTIONS) throw e;
      debug('Run stream failed, reconnecting: %o', e);
      await sleep(reconnectDelayMs(failures));
    }
  }
  emit({ type: 'runEnd', status: endStatus });
}

async function getRestRun(apiKey: string, runId: string) {
  const res = await getClient(ClientType.REST_API).request<{ data: RestRun }>({
    method: 'GET',
    url: `v1/runs/${encodeURIComponent(runId)}`,
    params: { include_specs: false },
    headers: getAuthHeaders({ apiKey }),
  });
  return res.data.data;
}

/**
 * The status `runEnd` reports. The API also sends `runEnd` for a run with no
 * stored status: one recorded before the API stored it, which has ended.
 */
export function runEndStatus(run: StreamRun): RunEndStatus {
  switch (run.completionState) {
    case 'CANCELED':
      return 'cancelled';
    case 'TIMEOUT':
      return 'timedOut';
    default:
      return run.status === 'PASSED' ? 'passed' : 'failed';
  }
}
