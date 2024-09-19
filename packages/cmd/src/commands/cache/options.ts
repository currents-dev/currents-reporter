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

export const presetOption = new Option(
  "--preset <preset-name>",
  'A set of predefined options. Use "last-failed-sharding" to get the last failed run data'
).choices(["last-failed-sharding", "last-failed-or8n"]);

export const outputDirOption = new Option(
  "--output-dir <dir>",
  "Path to the directory where output will be written"
);
