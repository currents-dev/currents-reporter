import { Command } from "@commander-js/extra-typings";
import { getUploadCommand } from "../../commands/upload";
import { CurrentsConfig } from "./config";

type ExtractSecondTags<T> = T extends Command<any, infer U> ? U : never;
export type CLIOptions = ExtractSecondTags<
  ReturnType<typeof getUploadCommand>
>;

/**
 * Converts CLI options to Currents config.
 * Mosty used for converting the keys.
 * @param cliOptions
 * @returns
 */
export function cliOptionsToConfig(
  cliOptions: CLIOptions
): Partial<CurrentsConfig> {
  return {
    ciBuildId: cliOptions.ciBuildId,
    projectId: cliOptions.projectId,
    recordKey: cliOptions.key,
    tag: cliOptions.tag,
    removeTitleTags: cliOptions.removeTitleTags,
    disableTitleTags: cliOptions.disableTitleTags,
    debug: cliOptions.debug,
    machineId: cliOptions.machineId,
    reportDir: cliOptions.reportDir,
  };
}
