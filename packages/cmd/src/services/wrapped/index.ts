import { debug as _debug } from '@debug';
import { chunk } from 'lodash';
import { getAuthHeaders } from '../../api/auth';
import { ClientType, getClient } from '../../http/client';
import { requireRestAPIBaseUrl } from '../../http/httpConfig';
import { getAttemptSteps } from '../watch';
import { graphqlQuery } from '../watch/graphql';
import type { AttemptStep } from '../watch/records';
import type { CardInput } from './card';
import {
  computeRunFacts,
  WRAPPED_RECORD_FIELDS,
  type WrappedRecord,
} from './facts';

const debug = _debug.extend('wrapped');

/**
 * Steps come one attempt per request, about 15 per second. Above this many
 * attempts the card leaves the step facts out instead of counting part of them.
 */
export const MAX_STEP_READS = 200;
const STEP_READS_AT_ONCE = 5;

type RestRun = {
  createdAt: string;
  durationMs?: number | null;
  completionState: 'IN_PROGRESS' | 'COMPLETE' | 'CANCELED' | 'TIMEOUT';
};

/**
 * What the card shows. With `requireEnded` it throws for a run in progress;
 * without, the facts cover the tests that finished so far.
 */
export async function getRunWrapped(
  apiKey: string,
  runId: string,
  { requireEnded }: { requireEnded: boolean }
): Promise<CardInput> {
  const run = await getRestRun(apiKey, runId);
  if (requireEnded && run.completionState === 'IN_PROGRESS') {
    throw new Error(
      `Run ${runId} has not ended: run \`currents watch ${runId} --wrapped\` to see the card when it ends`
    );
  }
  const { testRecordList: records } = await graphqlQuery<{
    testRecordList: WrappedRecord[];
  }>(
    apiKey,
    `query ($runId: String!) { testRecordList(input: { runId: $runId }) { ${WRAPPED_RECORD_FIELDS} } }`,
    { runId }
  );

  const ran = records.flatMap((record) =>
    record.attempts
      .filter((a) => a.parallelIndex >= 0)
      .map((a) => ({ recordId: record.recordId, attempt: a.attempt }))
  );
  const readSteps = ran.length <= MAX_STEP_READS;
  const attemptSteps = readSteps ? await readAllSteps(apiKey, ran) : undefined;

  return {
    facts: computeRunFacts({
      records,
      createdAt: Date.parse(run.createdAt),
      wallMs: run.durationMs ?? undefined,
      attemptSteps,
    }),
    runUrl: dashboardRunUrl(runId),
    stepsNote: !readSteps
      ? `Steps not read: ${ran.length.toLocaleString('en-US')} attempts, more than ${MAX_STEP_READS}`
      : attemptSteps
        ? undefined
        : 'Steps not read: the request failed',
  };
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
 * The steps of each attempt. If any attempt's steps cannot be read the step
 * facts are left out, so that the counts are never short.
 */
async function readAllSteps(
  apiKey: string,
  attempts: { recordId: string; attempt: number }[]
): Promise<AttemptStep[][] | undefined> {
  const all: AttemptStep[][] = [];
  try {
    for (const batch of chunk(attempts, STEP_READS_AT_ONCE)) {
      const steps = await Promise.all(
        batch.map(({ recordId, attempt }) =>
          getAttemptSteps(apiKey, recordId, attempt)
        )
      );
      all.push(...steps.map((s) => s ?? []));
    }
  } catch (e) {
    debug('Could not read the steps: %o', e);
    return undefined;
  }
  return all;
}

/**
 * The dashboard serves runs at `/run/<id>`. Its address is the REST API's with
 * `api` changed to `app` (api.currents.dev, api-staging.currents.dev). Other
 * installations get no link.
 */
export function dashboardRunUrl(runId: string) {
  try {
    const url = new URL(requireRestAPIBaseUrl());
    if (!/^api[.-]/.test(url.hostname)) return undefined;
    url.hostname = `app${url.hostname.slice('api'.length)}`;
    url.pathname = `/run/${encodeURIComponent(runId)}`;
    url.search = '';
    url.username = '';
    url.password = '';
    return url.toString();
  } catch {
    return undefined;
  }
}
