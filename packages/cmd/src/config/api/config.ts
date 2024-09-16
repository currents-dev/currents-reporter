import { debug as _debug } from "@debug";

import { getValidatedConfig } from "../utils";
import { configKeys, getEnvVariables } from "./env";

const debug = _debug.extend("config");

export type APICommandConfig = {
  /**
   * The api key used for authentication. Read more: https://docs.currents.dev/resources/api/api-keys#managing-the-api-keys
   */
  apiKey: string;

  /**
   * Enable debug logs.
   */
  debug?: boolean;
};

export type APIGetRunCommandConfig = {
  /**
   * The id of the build to record the test run. Read more: https://currents.dev/readme/guides/ci-build-id
   */
  ciBuildId?: string;

  /**
   * The id of the project the run is recorded.
   */
  projectId?: string;

  /**
   * The branch the run was created for.
   */
  branch?: string;

  /**
   * A list of tags attached to the run.
   */
  tag?: string[];

  /**
   * Specify in order to produce the .last-run.json output.
   */
  lastFailed?: boolean;
};

type MandatoryAPICommandConfigKeys = "apiKey";

const mandatoryConfigKeys: MandatoryAPICommandConfigKeys[] = ["apiKey"];

let _config: (APICommandConfig & APIGetRunCommandConfig) | null = null;

export function setAPIGetRunCommandConfig(
  options?: Partial<APICommandConfig & APIGetRunCommandConfig>
) {
  _config = getValidatedConfig(
    configKeys,
    mandatoryConfigKeys,
    getEnvVariables,
    options
  );
  debug("Resolved config: %o", _config);
}

export function getAPIGetRunCommandConfig() {
  return _config;
}
