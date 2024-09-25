import { Option } from "@commander-js/extra-typings";
import { configKeys } from "../../config/api";
import { getEnvironmentVariableName } from "../../config/utils";
import { parseCommaSeparatedList } from "../utils";

export const apiKeyOption = new Option(
  "--api-key <api-key>",
  "API key from Currents dashboard for authentication"
).env(getEnvironmentVariableName(configKeys, "apiKey"));

export const outputOption = new Option(
  "-o, --output <path>",
  "Path to the file where output will be written"
).env(getEnvironmentVariableName(configKeys, "output"));

export const ciBuildIdOption = new Option(
  "--ci-build-id <id>",
  "Unique identifier for the run"
);

export const projectOption = new Option(
  "-p, --project-id <project>",
  "Project ID from Currents associated with the run"
).env(getEnvironmentVariableName(configKeys, "projectId"));

export const tagOption = new Option(
  "-t, --tag <tag>",
  "Comma-separated list of tags for the run"
).argParser(parseCommaSeparatedList);

export const debugOption = new Option("--debug", "Enable debug logging")
  .env(getEnvironmentVariableName(configKeys, "debug"))
  .default(false);

export const branchOption = new Option(
  "-b, --branch <branch>",
  "Branch name for the recorded run"
);

export const pwLastRunOption = new Option(
  "--pw-last-run",
  'Generate output formatted for Playwright ".last-run.json"'
);
