import { CurrentsConfig } from "./config";

export const configKey = {
  debug: {
    name: "Debug",
    env: "CURRENTS_DEBUG",
    cli: "--debug",
  },
  ciBuildId: {
    name: "CI Build ID",
    env: "CURRENTS_CI_BUILD_ID",
    cli: "--ci-build-id",
  },
  recordKey: {
    name: "Record Key",
    env: "CURRENTS_RECORD_KEY",
    cli: "--key",
  },
  projectId: {
    name: "Project ID",
    env: "CURRENTS_PROJECT_ID",
    cli: "--project-id",
  },
  tag: {
    name: "Currents Tag",
    env: "CURRENTS_TAG",
    cli: "--tag",
  },
  disableTitleTags: {
    name: "Disable Title Tags",
    env: "CURRENTS_DISABLE_TITLE_TAGS",
    cli: "--disable-title-tags",
  },
  removeTitleTags: {
    name: "Remove Title Tags",
    env: "CURRENTS_REMOVE_TITLE_TAGS",
    cli: "--remove-title-tags",
  },
  machineId: {
    name: "Machine ID",
    env: "CURRENTS_MACHINE_ID",
    cli: "--machine-id",
  },
  reportDir: {
    name: "Report Directory",
    env: "CURRENTS_REPORT_DIR",
    cli: "--report-dir",
  },
} as const;

export function getEnvironmentVariableName(variable: keyof typeof configKey) {
  return configKey[variable].env;
}

export function getCLIOptionName(variable: keyof typeof configKey) {
  return configKey[variable].cli;
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
    disableTitleTags: !!process.env[configKey.disableTitleTags.env],
    removeTitleTags: !!process.env[configKey.removeTitleTags.env],
    debug: !!process.env[configKey.debug.env],
    machineId: process.env[configKey.machineId.env],
  };
}
