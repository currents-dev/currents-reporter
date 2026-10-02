import { Command } from '@commander-js/extra-typings';
import { getRunAttachConfig } from '../../config/session';
import { handleRunAttach } from '../../services/session';
import { getRunGetCommand, getRunGetExamples } from '../api';
import { getCancelCommand, getCancelExamples } from '../cancel';
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
import { getUploadCommand, getUploadExamples } from '../upload';

const COMMAND_NAME = 'run';

export const getRunAttachExamples = (name: string): HelpExample[] => [
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
    .addHelpText('after', formatExamples(getRunAttachExamples(name)))
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
    .description('Upload test results and work with runs recorded in CI')
    .addHelpText(
      'after',
      formatExamples([
        ...getUploadExamples(name).slice(0, 2),
        getRunAttachExamples(name)[0],
        getRunGetExamples(name)[0],
        getCancelExamples(name)[0],
      ])
    )
    .showHelpAfterError('(add --help for additional information)')
    .addCommand(getUploadCommand(name))
    .addCommand(getAttachCommand(name))
    .addCommand(getRunGetCommand(name))
    .addCommand(getCancelCommand(name));
