import { Command } from '@commander-js/extra-typings';
import { dim } from '@logger';
import chalk from 'chalk';
import { getRunHandler } from './get-run';
import {
  apiKeyOption,
  branchOption,
  ciBuildIdOption,
  debugOption,
  outputOption,
  projectOption,
  pwLastRunOption,
  tagOption,
} from './options';

const COMMAND_NAME = 'api';
const getExample = (name: string) => `

${chalk.bold('Examples')}

Obtain run data by --ci-build-id:
${dim(`${name} ${COMMAND_NAME} get-run --api-key <api-key> --ci-build-id <ci-build-id>`)}

Obtain most recent run data by filters:
${dim(`${name} ${COMMAND_NAME} get-run --api-key <api-key> --project-id <project-id> --branch <branch> --tag tagA,tagB`)}

Obtain last run data that matches the Playwright "test-results/.last-run.json":
${dim(`${name} ${COMMAND_NAME} get-run --api-key <api-key> --ci-build-id <ci-build-id> --pw-last-run --output <output-path>`)}

`;

export const getApiCommand = (name: string) => {
  const command = new Command()
    .command(COMMAND_NAME)
    .showHelpAfterError('(add --help for additional information)')
    .allowUnknownOption()
    .addCommand(getRunCommand(name));

  return command;
};

export const getRunCommand = (name: string) => {
  const command = new Command()
    .name('get-run')
    .description(`Receive information from Currents API ${getExample(name)}`)
    .allowUnknownOption()
    .addOption(apiKeyOption)
    .addOption(debugOption)
    .addOption(ciBuildIdOption)
    .addOption(projectOption)
    .addOption(branchOption)
    .addOption(tagOption)
    .addOption(outputOption)
    .addOption(pwLastRunOption)
    .action(getRunHandler);

  return command;
};
