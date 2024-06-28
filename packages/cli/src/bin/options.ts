import { Option } from "@commander-js/extra-typings";

import { getEnvironmentVariableName } from "../config";
import {
  parseAutoCancelFailures,
  parseDebug,
  parseResetSignal,
} from "../config/parser";

export const ciBuildIdOption = new Option(
  "--ci-build-id <id>",
  "the unique identifier for a run"
).env(getEnvironmentVariableName("ciBuildId"));

export const recordKeyOption = new Option(
  "-k, --key <record-key>",
  "your secret Record Key obtained from Currents"
).env(getEnvironmentVariableName("recordKey"));

export const projectOption = new Option(
  "-p, --project-id <project>",
  "the project ID for results reporting obtained from Currents"
).env(getEnvironmentVariableName("projectId"));

export const tagOption = new Option(
  "-t, --tag <tag>",
  "comma-separated tag(s) for recorded runs in Currents"
).argParser(parseCommaSeparatedList);

export const removeTagOption = new Option(
  "--remove-title-tags",
  "remove tags from test names in Currents, e.g. `Test name @smoke` becomes `Test name` in the dashboard"
).default(false);

export const disableTitleTagsOption = new Option(
  "--disable-title-tags",
  "disable parsing tags from test title, e.g. `Test name @smoke` would not be tagged with `smoke` in the dashboard"
).default(false);

export const machineIdOption = new Option(
  "--machine-id <string>",
  "unique identifier of the machine running the tests. If not provided, it will be generated automatically. See: https://docs.currents.dev/?q=machineId"
).env(getEnvironmentVariableName("machineId"));

export const reportDirOption = new Option(
  "--report-dir <string>",
  "explicit path to the report directory"
).env(getEnvironmentVariableName("reportDir"));

export const debugOption = new Option(
  "--debug <boolean>",
  "enable debug logs for the reporter"
)
  .env(getEnvironmentVariableName("debug"))
  .default(false);

export const inspectOption = new Option(
  "--inspect",
  "enable inspect mode, run playwright with --inspect-brk flag or developments and debugging"
)
  .default(false)
  .hideHelp();

function parseCommaSeparatedList(value: string, previous: string[] = []) {
  if (value) {
    return previous.concat(value.split(",").map((t) => t.trim()));
  }
  return previous;
}
