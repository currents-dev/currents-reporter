import { CurrentsConfig } from "./config";

export const configKey = {
  debug: {
    name: "Debug",
    env: "CURRENTS_DEBUG",
  },
  ciBuildId: {
    name: "CI Build ID",
    env: "CURRENTS_CI_BUILD_ID",
  },
  recordKey: {
    name: "Record Key",
    env: "CURRENTS_RECORD_KEY",
  },
  projectId: {
    name: "Project ID",
    env: "CURRENTS_PROJECT_ID",
  },
  tag: {
    name: "Currents Tag",
    env: "CURRENTS_TAG",
  },
  cancelAfterFailures: {
    name: "Currents Cancel After Failures",
    env: "CURRENTS_CANCEL_AFTER_FAILURES",
  },
  disableTitleTags: {
    name: "Disable Title Tags",
    env: "CURRENTS_DISABLE_TITLE_TAGS",
  },
  testSuiteFile: {
    name: "Test Suite File",
    env: "CURRENTS_TEST_SUITE_FILE",
  },
  machineId: {
    name: "Machine ID",
    env: "CURRENTS_MACHINE_ID",
  },
  reportDir: {
    name: "Report Directory",
    env: "CURRENTS_REPORT_DIR",
  },
} as const;

export function getEnvironmentVariableName(variable: keyof typeof configKey) {
  return configKey[variable].env;
}

export function getConfigName(variable: keyof typeof configKey) {
  return configKey[variable].name;
}

/**
 * Converts Environment variables to Currents config.
 * @returns
 */
export function getEnvVariables(): Partial<
  Record<keyof CurrentsConfig, string | string[] | boolean | number | undefined>
> {
  return {
    projectId: process.env[configKey.projectId.env],
    recordKey: process.env[configKey.recordKey.env],
    ciBuildId: process.env[configKey.ciBuildId.env],
    tag: process.env[configKey.tag.env]
      ? process.env[configKey.tag.env]?.split(",").map((i) => i.trim())
      : undefined,
    disableTitleTags: process.env[configKey.disableTitleTags.env],
    debug: process.env[configKey.debug.env],
    machineId: process.env[configKey.machineId.env],
  };
}
