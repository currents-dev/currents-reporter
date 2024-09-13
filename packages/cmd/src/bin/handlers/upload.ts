import { CommanderError } from "@commander-js/extra-typings";
import { currentsReporter } from "../..";
import { getCurrentsConfig, setCurrentsConfig } from "../../config";
import { ValidationError } from "../../lib";
import { error, info, success } from "../../logger";
import { CLIManager } from "../cli-config";
import { getCurrentsUploadCommand } from "../program";

export async function uploadHandler(
  options: ReturnType<ReturnType<typeof getCurrentsUploadCommand>["opts"]>
) {
  const cliManager = new CLIManager(options);
  setCurrentsConfig(cliManager.parsedConfig);
  const config = getCurrentsConfig();

  info("Currents config: %o", {
    ...config,
    recordKey: config?.recordKey ? "*****" : undefined,
  });

  return currentsReporter()
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
}
