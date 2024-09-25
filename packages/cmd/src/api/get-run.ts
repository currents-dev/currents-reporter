import { debug as _debug } from "../debug";
import { makeRequest } from "../http";
import { ClientType } from "../http/client";

const debug = _debug.extend("api");

export type GetRunParams = {
  projectId: string;
  ciBuildId?: string;
  branch?: string;
  tag?: string[];
  pwLastRun?: boolean;
};

export type GetRunResponse<
  T = {
    pwLastRun?: unknown;
  },
> = {
  data: T;
  status: "OK";
};

export async function getRun(apiKey: string, params: GetRunParams) {
  try {
    debug("Run params: %o", params);

    return makeRequest<GetRunResponse>(ClientType.REST_API, {
      url: `v1/runs/previous`,
      params,
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
    }).then((res) => res.data);
  } catch (err) {
    debug("Failed to obtain run data:", err);
    throw err;
  }
}
