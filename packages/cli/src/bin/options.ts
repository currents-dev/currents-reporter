import { Option } from "@commander-js/extra-typings";

import { getEnvironmentVariableName } from "../config";

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
)
  .argParser(parseCommaSeparatedList)
  .hideHelp();

export const removeTagOption = new Option(
  "--remove-title-tags",
  "remove tags from test names in Currents, e.g. `Test name @smoke` becomes `Test name` in the dashboard"
)
  .default(false)
  .hideHelp();

export const disableTitleTagsOption = new Option(
  "--disable-title-tags",
  "disable parsing tags from test title, e.g. `Test name @smoke` would not be tagged with `smoke` in the dashboard"
)
  .default(false)
  .hideHelp();

export const machineIdOption = new Option(
  "--machine-id <string>",
  "unique identifier of the machine running the tests. If not provided, it will be generated automatically. See: https://docs.currents.dev/?q=machineId"
).env(getEnvironmentVariableName("machineId"));

export const reportDirOption = new Option(
  "--report-dir <string>",
  "explicit path to the report directory"
).env(getEnvironmentVariableName("reportDir"));

export const debugOption = new Option("--debug", "enable debug logs")
  .env(getEnvironmentVariableName("debug"))
  .default(false);

function parseCommaSeparatedList(value: string, previous: string[] = []) {
  if (value) {
    return previous.concat(value.split(",").map((t) => t.trim()));
  }
  return previous;
}
