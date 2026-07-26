import { debug as _debug } from '../debug';
import { makeRequest } from '../http';
import { ClientType } from '../http/client';
import { maskRecordKey } from '../lib';

const debug = _debug.extend('api');

export type CancelRunParams = {
  recordKey: string;
  projectId: string;
  /**
   * Either identifies the run. `runId` wins when both are sent.
   */
  ciBuildId?: string;
  runId?: string;
};

export type CancelRunResponse = {
  status: 'OK';
  data: {
    /**
     * `null` when there is no run to cancel - a job cancelled before it
     * reported anything never created one.
     */
    runId: string | null;
    cancellation: {
      actor: string;
      reason: string;
      canceledAt: string;
    } | null;
  };
};

export async function cancelRun(params: CancelRunParams) {
  debug('Cancel params: %o', maskRecordKey(params));

  // No catch: an AxiosError carries the request config, so logging it would put
  // the record key in the debug output. makeRequest already logs the status,
  // url and response body of a failure.
  const res = await makeRequest<CancelRunResponse, CancelRunParams>(
    ClientType.API,
    {
      url: `v1/runs/cancel`,
      method: 'POST',
      data: params,
    }
  );

  return res.data;
}
