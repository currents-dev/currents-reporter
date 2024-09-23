import { CacheCommandConfig } from "./config";

const cacheCommandConfigKeys = {
  recordKey: {
    name: "Record Key",
    env: "CURRENTS_RECORD_KEY",
    cli: "--key",
  },
  debug: {
    name: "Debug",
    env: "CURRENTS_DEBUG",
    cli: "--debug",
  },
} as const;

const cacheSetCommandConfigKeys = {
  id: {
    name: "Cache id",
    cli: "--id",
  },
  preset: {
    name: "Preset",
    cli: "--preset",
  },
  pwOutputDir: {
    name: "Playwright output directory",
    cli: "--pw-output-dir",
  },
  paths: {
    name: "Paths to cache",
    cli: "--paths",
  },
} as const;

const cacheGetCommandConfigKeys = {
  id: {
    name: "Cache id",
    cli: "--id",
  },
  preset: {
    name: "Preset",
    cli: "--preset",
  },
  pwOutputDir: {
    name: "Playwright output directory",
    cli: "--pw-output-dir",
  },
  outputDir: {
    name: "Custom directory to write output",
    cli: "--output-dir",
  },
} as const;

export const configKeys = {
  ...cacheCommandConfigKeys,
  ...cacheSetCommandConfigKeys,
  ...cacheGetCommandConfigKeys,
} as const;

export function getEnvVariables(): Partial<
  Record<
    keyof CacheCommandConfig,
    string | string[] | boolean | number | undefined
  >
> {
  return {
    recordKey: process.env[configKeys.recordKey.env],
    debug: !!process.env[configKeys.debug.env],
  };
}
