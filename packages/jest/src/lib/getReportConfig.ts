import { omit } from "lodash";
import { getJestArgv } from "./args";
import { Config } from "@jest/types";
import { getJestVersion } from "./versions";
import { ReportConfig } from "../types";

export function getReportConfig(
  config: Config.GlobalConfig
): ReportConfig {
  const argv = getJestArgv();

  return {
    framework: "jest",
    frameworkVersion: getJestVersion(),
    cliArgs: {
      options: omit(argv, "_", "$0"),
      args: argv._ as string[],
    },
    frameworkConfig: config,
  };
}
