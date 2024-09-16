import { Command } from "@commander-js/extra-typings";
import { dim } from "@logger";
import chalk from "chalk";
import { getRunHandler } from "./get-run";
import {
  apiKeyOption,
  branchOption,
  ciBuildIdOption,
  debugOption,
  lastFailedOption,
  projectOption,
  tagOption,
} from "./options";

const COMMAND_NAME = "api";
const getExample = (name: string) => `
----------------------------------------------------
📖 Documentation: https://docs.currents.dev
🤙 Support:       support@currents.dev
----------------------------------------------------

${chalk.bold("Examples")}

Obtain last run data by --ci-build-id:
${dim(`${name} ${COMMAND_NAME} get-run --api-key <api-key> --ci-build-id --provider <provider>`)}

Obtain last run data using filters:
${dim(`${name} ${COMMAND_NAME} get-run --api-key <api-key> --project-id <project-id> --branch <branch> --tag tagA --tag tagB`)}
`;

export const getApiCommand = (name: string) => {
  const command = new Command()
    .command(COMMAND_NAME)
    .description(`Receive information from Currents API ${getExample(name)}`)
    .showHelpAfterError("(add --help for additional information)")
    .allowUnknownOption()
    .addCommand(getRunCommand());

  return command;
};

export const getRunCommand = () => {
  const command = new Command()
    .name("get-run")
    .allowUnknownOption()
    .addOption(apiKeyOption)
    .addOption(debugOption)
    .addOption(ciBuildIdOption)
    .addOption(projectOption)
    .addOption(branchOption)
    .addOption(tagOption)
    .addOption(lastFailedOption)
    .addOption(debugOption)
    .action(getRunHandler);

  return command;
};
