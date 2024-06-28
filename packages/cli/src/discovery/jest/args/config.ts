import fs from "fs";
import { readInitialOptions } from "jest-config";
import { omit } from "lodash";
import path from "path";
import { retryWithBackoff } from "../utils";
import { readFileContents } from "../utils/fs";
// import { debug } from "../../debug";

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

    fs.writeFileSync(
      tmpFilePath,
      `module.exports=${JSON.stringify(parsedConfigObject, null, 2)}`
    );

    await retryWithBackoff(
      readFileContents,
      [200, 200, 200, 200, 200, 1000]
    )(tmpFilePath);

    return tmpFilePath;
  } catch (error) {
    console.error("Failed to recreate the config file");
    // debug("error %o", error);
    return null;
  }
}
