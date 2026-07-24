import { Command } from '@commander-js/extra-typings';
import { dim } from '@logger';
import chalk from 'chalk';
import { cancelHandler } from './cancel';
import {
  ciBuildIdOption,
  debugOption,
  projectOption,
  recordKeyOption,
} from './options';

const COMMAND_NAME = 'cancel';
const getExample = (name: string) => `

${chalk.bold('Examples')}

Cancel the run recorded under a CI build id:
${dim(`${name} ${COMMAND_NAME} --key <record-key> --project-id <id> --ci-build-id <build-id>`)}

Cancel the run when a GitHub Actions workflow is cancelled:
${dim(`- if: \${{ cancelled() }}
  run: npx currents cancel`)}

`;

export const getCancelCommand = (name: string) => {
  const command = new Command()
    .name(COMMAND_NAME)
    .description(
      `Cancel a run in progress, e.g. when the CI job it belongs to is cancelled ${getExample(
        name
      )}`
    )
    .allowUnknownOption()
    .addOption(recordKeyOption)
    .addOption(projectOption)
    .addOption(ciBuildIdOption)
    .addOption(debugOption)
    .action(cancelHandler);

  return command;
};
