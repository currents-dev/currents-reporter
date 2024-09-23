import { Option } from "@commander-js/extra-typings";
import { configKeys } from "../../config/cache";
import { getEnvironmentVariableName } from "../../config/utils";
import { parseCommaSeparatedList } from "../utils";

export const recordKeyOption = new Option(
  "-k, --key <record-key>",
  "Your secret Record Key obtained from Currents"
).env(getEnvironmentVariableName(configKeys, "recordKey"));

export const debugOption = new Option("--debug", "Enable debug logging")
  .env(getEnvironmentVariableName(configKeys, "debug"))
  .default(false);

export const idOption = new Option(
  "--id <id>",
  "The ID the data is saved under in the cache"
);

export const pathsOption = new Option(
  "--paths <paths>",
  "Comma-separated list of paths to cache"
).argParser(parseCommaSeparatedList);

export enum PRESETS {
  lastRunSharding = "last-run-sharding",
  lastRunOr8n = "last-run-or8n",
}

export const presetOption = new Option(
  "--preset <preset-name>",
  'A set of predefined options. Use "last-run-sharding" to get the last run data'
);

export const outputDirOption = new Option(
  "--output-dir <dir>",
  "Path to the directory where output will be written"
);

export const pwOutputDirOption = new Option(
  "--pw-output-dir <dir>",
  "Directory for artifacts produced by Playwright tests"
).default("test-results");

export const includeHiddenOption = new Option(
  "--include-hidden",
  "Include hidden files in the cache"
).default(false);
