import { Command } from '@commander-js/extra-typings';
import { formatExamples, HelpExample } from '../help';
import { getRunHandler } from './get-run';
import {
  apiRequestHandler,
  fieldOption,
  headerOption,
  includeOption,
  inputOption,
  methodOption,
  rawFieldOption,
} from './request';
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

export const getApiExamples = (name: string): HelpExample[] => [
  {
    comment: 'Get a run, with the API key in CURRENTS_API_KEY',
    commands: [`${name} api /v1/runs/<run-id>`],
  },
  {
    comment: 'List the failed runs of the main branch of a project',
    commands: [
      `${name} api /v1/projects/<project-id>/runs -X GET -f "branches[]=main" -f status=FAILED -f limit=20`,
    ],
  },
  {
    comment: 'Cancel a run',
    commands: [`${name} api /v1/runs/<run-id>/cancel -X PUT`],
  },
  {
    comment: 'Create a webhook from the JSON in webhook.json',
    commands: [
      `${name} api /v1/webhooks -X POST -F projectId=<project-id> --input webhook.json`,
    ],
  },
];

// `currents api get-run` is the hidden path of `currents run get`. Options
// are positional so that the options of get-run, such as --api-key, reach it
// instead of api.
export const getApiCommand = (name: string) => {
  const command = new Command()
    .name('api')
    .summary('Make an authenticated request to the Currents REST API')
    .description(
      `Make an authenticated request to the Currents REST API and print the response body. The path is a REST API route, such as /v1/runs/<run-id>; v1/runs/<run-id> and runs/<run-id> are the same route. A response that is not 2xx prints its body on stderr and exits with 1.

The REST API routes: https://docs.currents.dev/resources/api/api-resources`
    )
    .usage('<path> [options]')
    .argument('<path>', 'the REST API route, such as /v1/runs/<run-id>')
    .enablePositionalOptions()
    .helpCommand(false)
    .addOption(apiKeyOption())
    .addOption(methodOption)
    .addOption(fieldOption)
    .addOption(rawFieldOption)
    .addOption(inputOption)
    .addOption(headerOption)
    .addOption(includeOption)
    .addOption(debugOption())
    .addHelpText('after', formatExamples(getApiExamples(name)))
    .showHelpAfterError('(add --help for additional information)')
    .addCommand(getRunGetCommand(name).name('get-run'), { hidden: true })
    // The implicit help command is off, so it is not listed next to the
    // hidden get-run; `api help` still prints the help instead of a request.
    .action((path, options, command) =>
      path === 'help' ? command.help() : apiRequestHandler(path, options)
    );

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
