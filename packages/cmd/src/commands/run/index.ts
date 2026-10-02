import { Command } from '@commander-js/extra-typings';
import { getRunAttachConfig } from '../../config/session';
import { handleRunAttach } from '../../services/session';
import { formatExamples, HelpExample } from '../help';
import { commandHandler } from '../utils';
import {
  apiKeyOption,
  attemptOption,
  captionOption,
  ciBuildIdOption,
  debugOption,
  groupOption,
  machineIdOption,
  metaOption,
  projectOption,
  recordKeyOption,
  specOption,
  testTitleOption,
  typeOption,
} from '../session/options';

const COMMAND_NAME = 'run';

const getExamples = (name: string): HelpExample[] => [
  {
    comment:
      'Attach the Docker logs of a CI machine to the run, after the tests finished',
    commands: [
      `${name} ${COMMAND_NAME} attach --key <record-key> --project-id <id> --ci-build-id <build-id> --machine-id shard-1 docker-logs.zip`,
    ],
  },
  {
    comment: 'Attach a screenshot to a test of a spec file',
    commands: [
      `${name} ${COMMAND_NAME} attach --key <record-key> --project-id <id> --ci-build-id <build-id> --spec tests/cart.spec.ts --test-title "adds an item" screenshot.png`,
    ],
  },
];

const getAttachCommand = (name: string) =>
  new Command()
    .name('attach')
    .addHelpText('after', formatExamples(getExamples(name)))
    .description('Upload files to a run recorded in CI')
    .argument('<paths...>', 'files or folders to attach')
    .addOption(recordKeyOption)
    .addOption(apiKeyOption)
    .addOption(projectOption)
    .addOption(ciBuildIdOption)
    .addOption(machineIdOption)
    .addOption(specOption)
    .addOption(groupOption)
    .addOption(testTitleOption)
    .addOption(attemptOption)
    .addOption(typeOption)
    .addOption(captionOption)
    .addOption(metaOption)
    .addOption(debugOption)
    .action(async (paths, options) => {
      await commandHandler(async ({ key, ...opts }) => {
        await handleRunAttach(
          getRunAttachConfig({ ...opts, recordKey: key }),
          paths
        );
      }, options);
    });

export const getRunFilesCommand = (name: string) =>
  new Command()
    .name(COMMAND_NAME)
    .summary('Attach files to a run recorded in CI')
    .description('Work with runs recorded in CI')
    .addHelpText('after', formatExamples(getExamples(name)))
    .showHelpAfterError('(add --help for additional information)')
    .addCommand(getAttachCommand(name));
