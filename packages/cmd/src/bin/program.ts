import { Command } from "@commander-js/extra-typings";
import { reporterVersion } from "@env/versions";
import { getApiCommand } from "../commands/api";
import { getUploadCommand } from "../commands/upload";

const NAME = "currents";
export const getProgram = () =>
  new Command(NAME)
    .version(reporterVersion)
    .addCommand(getUploadCommand(NAME), { isDefault: true })
    .addCommand(getApiCommand(NAME));
