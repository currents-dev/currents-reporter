import fs from "fs";
import { readInitialOptions } from "jest-config";
import { omit } from "lodash";
import path from "path";
import { debug as _debug } from "../../../debug";
import { error } from "../../../logger";
import { retryWithBackoff } from "../utils";
import { readFileContents } from "../utils/fs";

const debug = _debug.extend("jest-discovery");

export async function getConfigFilePath(
  explicitConfigFilePath?: string
): Promise<string | null> {
  try {
    const { config: initialConfig, configPath } = await readInitialOptions(
      explicitConfigFilePath
    );

    const parsedConfigObject = omit(initialConfig, [
      "collectCoverage",
      "collectCoverageFrom",
      "coverageDirectory",
      "coveragePathIgnorePatterns",
      "coverageProvider",
      "coverageReporters",
      "coverageThreshold",
      "detectLeaks",
      "detectOpenHandles",
      "reporters",
      "logHeapUsage",
      "listTests",
      "notify",
      "notifyMode",
      "silent",
      "verbose",
      "watch",
      "watchAll",
      "watchman",
      "watchPlugins",
      "shard",
    ]);

    if (
      parsedConfigObject.rootDir &&
      Object.keys(parsedConfigObject).length === 1
    ) {
      return null;
    }

    const tmpFilePath = path.resolve(
      configPath ? path.dirname(configPath) : process.cwd(),
      `.jest-scanner-${new Date().getTime()}.config.js`
    );

    const configFileContents = `module.exports=${JSON.stringify(parsedConfigObject, null, 2)}`;
    debug("configFileContent: %O", configFileContents);
    fs.writeFileSync(tmpFilePath, configFileContents);

    await retryWithBackoff(
      readFileContents,
      [200, 200, 200, 200, 200, 1000]
    )(tmpFilePath);

    return tmpFilePath;
  } catch (err) {
    error("Failed to recreate the config file");
    debug("error %o", err);
    return null;
  }
}
