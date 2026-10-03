import { Command } from '@commander-js/extra-typings';
import { formatExamples, HelpExample } from '../help';
import { getRunHandler } from './get-run';
import { apiKeyOption, debugOption, projectOption } from '../options';
import {
  branchOption,
  ciBuildIdOption,
  outputOption,
  pwLastRunOption,
  runTagOption,
} from './options';

const COMMAND_NAME = 'get';
const PARENT_NAME = 'run';
export const getRunGetExamples = (name: string): HelpExample[] => [
  {
    comment: 'Get the data of the run recorded under a CI build ID',
    commands: [
      `${name} ${PARENT_NAME} ${COMMAND_NAME} --api-key <api-key> --project-id <project-id> --ci-build-id <ci-build-id>`,
    ],
  },
  {
    comment:
      'Get the data of the last run of a branch with the tags tagA and tagB',
    commands: [
      `${name} ${PARENT_NAME} ${COMMAND_NAME} --api-key <api-key> --project-id <project-id> --branch <branch> --tag tagA,tagB`,
    ],
  },
  {
    comment:
      'Save the failed tests of a run where Playwright reads them, for "playwright test --last-failed"',
    commands: [
      `${name} ${PARENT_NAME} ${COMMAND_NAME} --api-key <api-key> --project-id <project-id> --ci-build-id <ci-build-id> --pw-last-run --output test-results/.last-run.json`,
    ],
  },
];

// `currents api get-run` is the hidden path of `currents run get`.
export const getApiCommand = (name: string) => {
  const command = new Command()
    .command('api')
    .summary('Get data from the Currents API')
    .description('Get data from the Currents API')
    .addHelpText('after', formatExamples(getRunGetExamples(name)))
    .showHelpAfterError('(add --help for additional information)')
    .allowUnknownOption()
    .addCommand(getRunGetCommand(name).name('get-run'));

  return command;
};

export const getRunGetCommand = (name: string) => {
  const command = new Command()
    .name(COMMAND_NAME)
    .summary('Get the data of a run from the Currents API')
    .description(
      'Get the data of a run from the Currents API and print it as JSON, or write it to --output. Find the run by --ci-build-id, or the last run by --branch, --tag or both'
    )
    .addHelpText('after', formatExamples(getRunGetExamples(name)))
    .allowUnknownOption()
    .addOption(apiKeyOption())
    .addOption(debugOption())
    .addOption(ciBuildIdOption)
    .addOption(projectOption())
    .addOption(branchOption)
    .addOption(runTagOption)
    .addOption(outputOption)
    .addOption(pwLastRunOption)
    .action(getRunHandler);

  return command;
};
