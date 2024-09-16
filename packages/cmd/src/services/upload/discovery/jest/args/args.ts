import { omit } from "lodash";

const ignoredOptions = [
  "bail", // causes unexpected behaviour
  "clearCache",
  "collectCoverage",
  "collectCoverageFrom",
  "color",
  "colors",
  "config",
  "coverage",
  "coverageDirectory",
  "coveragePathIgnorePatterns",
  "coverageProvider",
  "coverageReporters",
  "coverageThreshold",
  "debug",
  "detectLeaks",
  "detectOpenHandles",
  "errorOnDeprecated",
  "expand",
  "forceExit",
  "json",
  "listTests",
  "logHeapUsage",
  "noStackTrace",
  "notify",
  "notifyMode",
  "openHandlesTimeout",
  "outputFile",
  "reporters",
  "runner",
  "shard",
  "showConfig",
  "showSeed",
  "silent",
  "testNamePattern",
  "verbose",
  "waitNextEventLoopTurnForUnhandledRejectionEvents",
  "watch",
  "watchAll",
  "watchPathIgnorePatterns",
  "watchman",
];

export function getDiscoveryOptions(options: Record<string, unknown>) {
  return omit(options, ...ignoredOptions);
}

export function argvToString(argv: Record<string, any>) {
  let args = [];

  for (const [key, value] of Object.entries(argv)) {
    if (key === "_" || key === "$0" || key.includes("-")) continue; // skip _, script name and the kebab case properties added by yargs

    if (typeof value === "boolean") {
      if (value) {
        args.push(`--${key}`);
      }
    } else if (Array.isArray(value)) {
      value.forEach((val) => {
        args.push(`--${key}=${val}`);
      });
    } else {
      args.push(`--${key}=${value}`);
    }
  }

  return args.join(" ");
}
