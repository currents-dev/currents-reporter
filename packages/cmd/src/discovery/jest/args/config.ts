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

    const configOptionsToAvoid = [
      // from docs: https://jestjs.io/docs/configuration
      "collectCoverage",
      "collectCoverageFrom",
      "coverageDirectory",
      "coveragePathIgnorePatterns",
      "coverageProvider",
      "coverageReporters",
      "coverageThreshold",
      "errorOnDeprecated",
      "forceCoverageMatch",
      "notify",
      "notifyMode",
      "openHandlesTimeout",
      "reporters",
      "runner",
      "showSeed",
      "testFailureExitCode",
      "verbose",
      "watchPathIgnorePatterns",
      "watchPlugins",
      "watchman",

      // from Config type
      "bail", // causes unexpected behaviour
      "clearCache",
      "color",
      "colors",
      "debug",
      "detectLeaks",
      "detectOpenHandles",
      "expand",
      "forceExit",
      "json",
      "listTests",
      "logHeapUsage",
      "noStackTrace",
      "outputFile",
      "shard",
      "showConfig",
      "silent",
      "testNamePattern",
      "waitNextEventLoopTurnForUnhandledRejectionEvents",
      "watch",
      "watchAll",
    ];

    // from InitialProjectOptions type
    const projectConfigOptionsToAvoid = [
      "collectCoverageFrom",
      "coverageDirectory",
      "coveragePathIgnorePatterns",
      "detectLeaks",
      "detectOpenHandles",
      "errorOnDeprecated",
      "forceCoverageMatch",
      "openHandlesTimeout",
      "runner",
      "watchPathIgnorePatterns",
    ];

    const parsedConfigObject = omit(initialConfig, configOptionsToAvoid);

    if (parsedConfigObject.projects) {
      parsedConfigObject.projects = parsedConfigObject.projects.map(
        (project) =>
          typeof project !== "string"
            ? omit(project, projectConfigOptionsToAvoid)
            : project
      );
    }

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
