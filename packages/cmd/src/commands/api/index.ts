import { Command } from '@commander-js/extra-typings';
import { formatExamples, HelpExample } from '../help';
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
const getExamples = (name: string): HelpExample[] => [
  {
    comment: 'Get the data of the run recorded under a CI build ID',
    commands: [
      `${name} ${COMMAND_NAME} get-run --api-key <api-key> --ci-build-id <ci-build-id>`,
    ],
  },
  {
    comment: 'Get the data of the most recent run that matches the filters',
    commands: [
      `${name} ${COMMAND_NAME} get-run --api-key <api-key> --project-id <project-id> --branch <branch> --tag tagA,tagB`,
    ],
  },
  {
    comment:
      'Get the data of a run and save its failed tests for Playwright --last-failed',
    commands: [
      `${name} ${COMMAND_NAME} get-run --api-key <api-key> --ci-build-id <ci-build-id> --pw-last-run --output <output-path>`,
    ],
  },
];

export const getApiCommand = (name: string) => {
  const command = new Command()
    .command(COMMAND_NAME)
    .summary('Get data from the Currents API')
    .description('Get data from the Currents API')
    .addHelpText('after', formatExamples(getExamples(name)))
    .showHelpAfterError('(add --help for additional information)')
    .allowUnknownOption()
    .addCommand(getRunCommand(name));

  return command;
};

export const getRunCommand = (name: string) => {
  const command = new Command()
    .name('get-run')
    .description('Get the data of a run from the Currents API')
    .addHelpText('after', formatExamples(getExamples(name)))
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
