import { Config } from "@jest/types";
import fs from "fs-extra";
import { run } from "jest-cli";
import tmp from "tmp";

import { debug } from "../../debug";
import { readJsonFile } from "../../lib";
import { dim, error } from "../../logger";
import { CLIArgs } from "../../types";
import { FullTestSuite } from "../types";
import { getCLIArgs } from "./args";
import { retryWithBackoff } from "./utils";
import { readFileContents } from "./utils/fs";

export async function jestScanner(
  _config: Config.GlobalConfig,
  cliArgsFromConfig: CLIArgs
) {
  console.time(dim("@currents/jest:fullTestSuite-ready"));

  const { cliArgs, configFilePath } = await getCLIArgs(cliArgsFromConfig);

  try {
    const tmpFile = tmp.fileSync({ postfix: ".json" });

    debug("running scanner: %o", cliArgs);

    // eslint-disable-next-line turbo/no-undeclared-env-vars
    process.env.CURRENTS_DISCOVERY_PATH = tmpFile.name;
    // set openHandlesTimeout to 0 to avoid Jest "open handles" warning
    await run(cliArgs.concat(["--openHandlesTimeout=0"]));

    await retryWithBackoff(
      readFileContents,
      Array.from({ length: 300 }, () => 100) // 30s
    )(tmpFile.name);
    console.timeEnd(dim("@currents/jest:fullTestSuite-ready"));

    return await readJsonFile<FullTestSuite>(tmpFile.name);
  } catch (err) {
    error("Failed to obtain the jest full test suite:", err);
    return [];
  } finally {
    if (configFilePath) {
      fs.unlinkSync(configFilePath);
    }
  }
}
