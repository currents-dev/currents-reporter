import { debug as _debug } from '@debug';
import { chunk } from 'lodash';
import { getAuthHeaders } from '../../api/auth';
import { ClientType, getClient } from '../../http/client';
import type { RunEndStatus, TerminalRunEvent } from './events';
import { graphqlQuery, openSubscriptions } from './graphql';
import {
  ATTEMPT_STEP_FIELDS,
  RecordEvents,
  TEST_RECORD_FIELDS,
  type AttemptStep,
  type TestRecord,
} from './records';

const debug = _debug.extend('watch');

/** How often the run status is read: no subscription reports a finished run. */
const RUN_STATUS_INTERVAL_MS = 10_000;
/** The most record IDs the `testRecords` query takes. */
const RECORDS_PER_QUERY = 200;
/** How many attempts' steps are read at once. */
const STEP_READS_AT_ONCE = 5;

type RestRun = {
  projectId: string;
  createdAt: string;
  status: 'RUNNING' | 'FAILING' | 'PASSED' | 'FAILED';
  completionState: 'IN_PROGRESS' | 'COMPLETE' | 'CANCELED' | 'TIMEOUT';
  groups: { tests: { total: number } }[];
};

/**
 * Follows a run until it ends and passes its events to `emit`. The org of the
 * records comes from the credential: the API fills `orgId` in for API keys and
 * personal access tokens.
 */
export async function watchRun(
  apiKey: string,
  runId: string,
  emit: (event: TerminalRunEvent) => void
) {
  const run = await getRestRun(apiKey, runId);
  emit({
    type: 'runBegin',
    totalTests: run.groups.reduce((sum, g) => sum + g.tests.total, 0),
    startedAt: Date.parse(run.createdAt),
  });

  const records = new RecordEvents();
  const apply = async (list: TestRecord[]) => {
    const steps = await readSteps(apiKey, list, records);
    list.forEach((record) =>
      records.next(record, steps.get(record.recordId)).forEach(emit)
    );
  };
  // Fetches run one after another, so that the events of a record keep their
  // order. The first failure stops the watch and is thrown at the end.
  let queue = Promise.resolve();
  let failure: unknown;
  let stop = () => {};
  const enqueue = (fetch: () => Promise<TestRecord[]>) =>
    (queue = queue
      .then(() => (failure ? [] : fetch()))
      .then(apply)
      .catch((e) => {
        failure ??= e;
        stop();
      }));

  let endStatus = runEndStatus(run);
  if (endStatus) {
    await enqueue(() => listRecords(apiKey, runId));
    if (failure) throw failure;
    return emit({ type: 'runEnd', status: endStatus });
  }

  let resolveEnd: (status: RunEndStatus) => void;
  const ended = new Promise<RunEndStatus>((resolve) => (resolveEnd = resolve));
  const connection = openSubscriptions(apiKey, [
    {
      query: `subscription ($runId: String!) { runTestRecordsChanged(runId: $runId) { recordIds } }`,
      variables: { runId },
      onNext: (data) =>
        enqueue(() =>
          getRecords(apiKey, runId, data.runTestRecordsChanged.recordIds)
        ),
    },
    {
      query: `subscription ($projectId: String!) { runChanged(projectId: $projectId) { runId event } }`,
      variables: { projectId: run.projectId },
      onNext: (data) => {
        if (
          data.runChanged.runId === runId &&
          data.runChanged.event === 'CANCELLED'
        ) {
          resolveEnd('cancelled');
        }
      },
    },
  ]);
  stop = connection.close;
  const timer = setInterval(async () => {
    try {
      const status = runEndStatus(await getRestRun(apiKey, runId));
      if (status) resolveEnd(status);
    } catch (e) {
      debug('Could not read the run status: %o', e);
    }
  }, RUN_STATUS_INTERVAL_MS);

  try {
    await Promise.race([connection.ready, connection.closed]);
    // After subscribing, so that a change between the two is not missed.
    enqueue(() => listRecords(apiKey, runId));
    endStatus = await Promise.race([
      ended,
      connection.closed.then(() => undefined),
    ]);
  } finally {
    clearInterval(timer);
    connection.close();
  }
  // The last batch of changes can arrive after the run ended.
  await enqueue(() => listRecords(apiKey, runId));
  if (failure) throw failure;
  emit({ type: 'runEnd', status: endStatus ?? 'cancelled' });
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

export function runEndStatus(run: RestRun): RunEndStatus | undefined {
  switch (run.completionState) {
    case 'CANCELED':
      return 'cancelled';
    case 'TIMEOUT':
      return 'timedOut';
    case 'COMPLETE':
      return run.status === 'PASSED' ? 'passed' : 'failed';
  }
}

async function listRecords(apiKey: string, runId: string) {
  const data = await graphqlQuery<{ testRecordList: TestRecord[] }>(
    apiKey,
    `query ($runId: String!) { testRecordList(input: { runId: $runId }) { ${TEST_RECORD_FIELDS} } }`,
    { runId }
  );
  return data.testRecordList;
}

async function getRecords(apiKey: string, runId: string, recordIds: string[]) {
  const pages = await Promise.all(
    chunk(recordIds, RECORDS_PER_QUERY).map((ids) =>
      graphqlQuery<{ testRecords: TestRecord[] }>(
        apiKey,
        `query ($runId: String!, $ids: [ID!]!) { testRecords(input: { runId: $runId, recordIds: $ids }) { ${TEST_RECORD_FIELDS} } }`,
        { runId, ids }
      )
    )
  );
  return pages.flatMap((page) => page.testRecords);
}

/**
 * The steps of the attempts that `records` wants them for, by record ID and
 * attempt. An attempt whose steps cannot be read is left out: `RecordEvents`
 * then follows its latest step only.
 */
async function readSteps(
  apiKey: string,
  list: TestRecord[],
  records: RecordEvents
) {
  const reads = list.flatMap((record) =>
    records
      .attemptsNeedingSteps(record)
      .map((attempt) => ({ recordId: record.recordId, attempt }))
  );
  const steps = new Map<string, Map<number, AttemptStep[]>>();
  for (const batch of chunk(reads, STEP_READS_AT_ONCE)) {
    await Promise.all(
      batch.map(async ({ recordId, attempt }) => {
        try {
          const attemptSteps = await getAttemptSteps(apiKey, recordId, attempt);
          if (!attemptSteps) return;
          if (!steps.has(recordId)) steps.set(recordId, new Map());
          steps.get(recordId)!.set(attempt, attemptSteps);
        } catch (e) {
          debug('Could not read the steps of %s/%d: %o', recordId, attempt, e);
        }
      })
    );
  }
  return steps;
}

type SerializedStep = Omit<AttemptStep, 'steps'> & { steps: string };

export async function getAttemptSteps(
  apiKey: string,
  recordId: string,
  attempt: number
): Promise<AttemptStep[] | null> {
  const data = await graphqlQuery<{
    testAttempt: { steps: SerializedStep[] } | null;
  }>(
    apiKey,
    `query ($recordId: String!, $attempt: Int!) { testAttempt(input: { recordId: $recordId, attempt: $attempt }) { steps { ${ATTEMPT_STEP_FIELDS} } } }`,
    { recordId, attempt }
  );
  return (
    data.testAttempt?.steps.map((step) => ({
      ...step,
      steps: JSON.parse(step.steps) as AttemptStep[],
    })) ?? null
  );
}
