import { Command } from '@commander-js/extra-typings';
import { formatExamples, HelpExample } from '../help';
import { cancelHandler } from './cancel';
import {
  ciBuildIdOption,
  debugOption,
  projectOption,
  recordKeyOption,
  runIdOption,
} from './options';

const COMMAND_NAME = 'cancel';
const getExamples = (name: string): HelpExample[] => [
  {
    comment: 'Cancel the run recorded under a CI build ID',
    commands: [
      `${name} ${COMMAND_NAME} --key <record-key> --project-id <id> --ci-build-id <build-id>`,
    ],
  },
  {
    comment: 'Cancel a run by its ID, as reported when the run was created',
    commands: [
      `${name} ${COMMAND_NAME} --key <record-key> --project-id <id> --run-id <run-id>`,
    ],
  },
  {
    comment:
      'Cancel the run when a GitHub Actions workflow is cancelled (workflow step)',
    commands: [`- if: \${{ cancelled() }}\n  run: npx ${name} ${COMMAND_NAME}`],
  },
];

export const getCancelCommand = (name: string) => {
  const command = new Command()
    .name(COMMAND_NAME)
    .summary('Cancel a run in progress')
    .description(
      'Cancel a run in progress, e.g. when the CI job it belongs to is cancelled'
    )
    .addHelpText('after', formatExamples(getExamples(name)))
    .allowUnknownOption()
    .addOption(recordKeyOption)
    .addOption(projectOption)
    .addOption(ciBuildIdOption)
    .addOption(runIdOption)
    .addOption(debugOption)
    .action(cancelHandler);

  return command;
};
