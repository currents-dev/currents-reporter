import { debug as _debug } from '../debug';
import { makeRequest } from '../http';
import { ClientType } from '../http/client';
import { maskRecordKey } from '../lib';

const debug = _debug.extend('api');

export type CancelRunParams = {
  recordKey: string;
  projectId: string;
  ciBuildId: string;
};

export type CancelRunResponse = {
  status: 'OK';
  data: {
    runId: string;
    cancellation: {
      actor: string;
      reason: string;
      canceledAt: string;
    } | null;
  };
};

export async function cancelRun(params: CancelRunParams) {
  try {
    debug('Cancel params: %o', maskRecordKey(params));

    const res = await makeRequest<CancelRunResponse, CancelRunParams>(
      ClientType.API,
      {
        url: `v1/runs/cancel`,
        method: 'POST',
        data: params,
      }
    );

    return res.data;
  } catch (err) {
    debug('Failed to cancel the run:', err);
    throw err;
  }
}
