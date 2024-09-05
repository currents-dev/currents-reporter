#! /usr/bin/env node

import "source-map-support/register";

import("dotenv/config");

import { CommanderError } from "commander";
import { getCurrentsConfig, setCurrentsConfig } from "../config";
import { currentsReporter } from "../index";
import { ValidationError } from "../lib";
import { error, info, success } from "../logger";
import { CLIManager } from "./cli-config";

async function runScript() {
  const cliManager = new CLIManager();
  setCurrentsConfig(cliManager.parsedConfig);
  const config = getCurrentsConfig();

  info("Currents config: %o", {
    ...config,
    recordKey: config?.recordKey ? "*****" : undefined,
  });
  return currentsReporter();
}

runScript()
  .then(() => {
    success("Script execution finished");
    process.exit(0);
  })
  .catch((e) => {
    if (e instanceof CommanderError) {
      error(e.message);
      process.exit(e.exitCode);
    }

    if (e instanceof ValidationError) {
      error(e.message);
      process.exit(1);
    }

    error("Script execution failed:", e);
    process.exit(1);
  });
