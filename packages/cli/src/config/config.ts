import { debug as _debug } from "../debug";
import { ValidationError } from "../lib/error";
import { dim, error } from "../logger";

import {
  getCLIOptionName,
  getConfigName,
  getEnvVariables,
  getEnvironmentVariableName,
} from "./env";
import { getCLIOptions } from "./options";

const debug = _debug.extend("config");

export type CurrentsConfig = {
  /**
   * The id of the build to record the test run. Read more: https://currents.dev/readme/guides/ci-build-id
   */
  ciBuildId?: string;

  /**
   * The id of the project to record the test run.
   */
  projectId: string;

  /**
   * The record key to be used to record the results on the remote dashboard. Read more: https://currents.dev/readme/guides/record-key
   */
  recordKey: string;

  /**
   * A list of tags to be added to the test run.
   */
  tag?: string[];

  /**
   * remove tags from test names, for example `Test name @smoke` becomes `Test name`
   */
  removeTitleTags?: boolean;

  /**
   * disable extracting tags from test title, e.g. `Test name @smoke` would not be tagged with `smoke`
   */
  disableTitleTags?: boolean;

  /**
   * Unique identifier of the machine running the tests. If not provided, it will be generated automatically. See: https://currents.dev/readme/readme?q=machineId
   */
  machineId?: string;

  /**
   * Path to the report directory.
   */
  reportDir?: string;

  /**
   * Enable debug logs.
   */
  debug?: boolean;
};

type MandatoryCurrentsConfigKeys = "projectId" | "recordKey";

const mandatoryConfigKeys: MandatoryCurrentsConfigKeys[] = [
  "projectId",
  "recordKey",
];

let _config: CurrentsConfig | null = null;

/**
 * Precendence: env > cli > reporter config
 * @param reporterOptions reporter config
 */
export function setCurrentsConfig(reporterOptions?: Partial<CurrentsConfig>) {
  const result = {
    ...removeUndefined(reporterOptions),
    ...removeUndefined(getCLIOptions()),
    ...removeUndefined(getEnvVariables()),
  };

  mandatoryConfigKeys.forEach((i) => {
    if (!result[i]) {
      error(
        `${getConfigName(
          i
        )} is required for Currents Reporter. Use the following methods to set Currents Project ID:
- as environment variable: ${dim(getEnvironmentVariableName(i))}
- as CLI flag of pwc command: ${dim(getCLIOptionName(i))}`
      );
      throw new ValidationError("Missing required config variable");
    }
  });

  _config = result as CurrentsConfig;
  debug("Resolved Currents config: %o", _config);
}

function removeUndefined<T extends {}>(obj?: T): T {
  return Object.entries(obj ?? {}).reduce((acc, [key, value]) => {
    if (value === undefined) {
      return acc;
    }
    return {
      ...acc,
      [key]: value,
    };
  }, {} as T);
}

export function getCurrentsConfig() {
  return _config;
}
