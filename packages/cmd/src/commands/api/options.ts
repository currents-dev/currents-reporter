import { Option } from "@commander-js/extra-typings";
import { configKeys } from "../../config/api";
import { getEnvironmentVariableName } from "../../config/utils";
import { parseCommaSeparatedList } from "../utils";

export const apiKeyOption = new Option(
  "--api-key <api-key>",
  "your API Key obtained from Currents dashboard"
).env(getEnvironmentVariableName(configKeys, "apiKey"));

export const ciBuildIdOption = new Option(
  "--ci-build-id <id>",
  "the unique identifier for the recorded build (run)"
);

export const projectOption = new Option(
  "-p, --project-id <project>",
  "the project ID obtained from Currents"
);

export const tagOption = new Option(
  "-t, --tag <tag>",
  "comma-separated tag(s) associated with the Currents run"
).argParser(parseCommaSeparatedList);

export const debugOption = new Option("--debug", "enable debug logs")
  .env(getEnvironmentVariableName(configKeys, "debug"))
  .default(false);

export const branchOption = new Option(
  "-b, --branch <branch>",
  "branch name of the recorded run"
);

export const lastFailedOption = new Option(
  "--last-failed",
  "format the output for .last-run.json"
);
