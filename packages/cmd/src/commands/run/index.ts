import { Command } from '@commander-js/extra-typings';
import { dim } from '@logger';
import chalk from 'chalk';
import { getRunAttachConfig } from '../../config/session';
import { handleRunAttach } from '../../services/session';
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

const getExample = (name: string) => `

${chalk.bold('Examples')}

Attach the Docker logs of a CI machine to the run, after the tests finished:
${dim(`${name} ${COMMAND_NAME} attach --key <record-key> --project-id <id> --ci-build-id <build-id> --machine-id shard-1 docker-logs.zip`)}

Attach a screenshot to a test of a spec file:
${dim(`${name} ${COMMAND_NAME} attach --key <record-key> --project-id <id> --ci-build-id <build-id> --spec tests/cart.spec.ts --test-title "adds an item" screenshot.png`)}

`;

const getAttachCommand = () =>
  new Command()
    .name('attach')
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
    .description(`Work with runs recorded in CI ${getExample(name)}`)
    .showHelpAfterError('(add --help for additional information)')
    .addCommand(getAttachCommand());
