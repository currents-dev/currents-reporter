import { promisify } from "node:util";
import { gzip } from "node:zlib";
import { CurrentsConfig } from "../config";
import { debug as _debug } from "../debug";
import { FullTestSuite } from "../discovery";
import { Commit } from "../env/gitInfo";
import { CiProvider, CiProviderData } from "../env/types";
import { makeRequest } from "../http";
import { InstanceReport } from "../types";
import { error } from "../logger";

const debug = _debug.extend("run");
const gzipPromise = promisify(gzip);

export type Platform = {
  browserName: string;
  browserVersion?: string;
  osName: NodeJS.Platform;
  osVersion: string;
  osCpus: never[];
  osMemory: {
    free: number;
    total: number;
  };
};

export type Framework = {
  type: string;
  clientVersion: string | null;
  version: string | null;
};

export type RunCreationConfig = {
  currents: CurrentsConfig;
};

export type CI = {
  params:
    | CiProviderData
    | {
        [key: string]: string | undefined;
      };
  provider: CiProvider;
};

export type RunParams = {
  ciBuildId?: string;
  group: string;
  projectId: string;
  platform: Platform;
  machineId: string;
  framework: Framework;
  commit: Commit;
  tags: string[];
  ci: CI;
  fullTestSuite: FullTestSuite;
  instances: InstanceReport[];
  config: RunCreationConfig;
};

export type RunResponse = {
  runId: string;
  groupId: string;
  machineId: string;
  ciBuildId: string;
  dashboardUrl: string;
  runUrl: string;
  isNewRun: boolean;
  cancellation: unknown;
  warnings: any[];
};

export async function createRun(params: RunParams) {
  try {
    debug("Run params: %o", params);
    const data = await compressData(JSON.stringify(params));

    return makeRequest<RunResponse, Buffer>({
      url: `v1/runs`,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Encoding": "gzip",
      },
      data,
    }).then((res) => res.data);
  } catch (err) {
    debug("Failed to create the run:", err);
    throw err;
  }
}

async function compressData(data: string | Buffer): Promise<Buffer> {
  try {
    return await gzipPromise(data);
  } catch (err) {
    error("Failed to compress run payload:", err);
    throw err;
  }
}
