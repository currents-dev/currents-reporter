import { Command } from '@commander-js/extra-typings';
import { getRunAttachConfig } from '../../config/session';
import { handleRunAttach } from '../../services/session';
import { getRunGetCommand, getRunGetExamples } from '../api';
import { getCancelCommand, getCancelExamples } from '../cancel';
import { formatExamples, HelpExample } from '../help';
import { commandHandler } from '../utils';
import {
  apiKeyOption,
  debugOption,
  projectOption,
  recordKeyOption,
} from '../options';
import {
  API_KEY_NOTE,
  attemptOption,
  captionOption,
  ciBuildIdOption,
  groupOption,
  machineIdOption,
  metaOption,
  PATHS_DESCRIPTION,
  RECORD_KEY_NOTE,
  runTypeOption,
  specOption,
  testTitleOption,
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
    comment: 'Attach a screenshot to the first attempt of a test',
    commands: [
      `${name} ${COMMAND_NAME} attach --key <record-key> --project-id <id> --ci-build-id <build-id> --spec tests/cart.spec.ts --test-title "adds an item" --attempt 0 screenshot.png`,
    ],
  },
];

const getAttachCommand = (name: string) =>
  new Command()
    .name('attach')
    .addHelpText('after', formatExamples(getRunAttachExamples(name)))
    .description('Upload files to a run recorded in CI')
    .argument('<paths...>', PATHS_DESCRIPTION)
    .addOption(recordKeyOption(RECORD_KEY_NOTE))
    .addOption(apiKeyOption(API_KEY_NOTE))
    .addOption(projectOption())
    .addOption(ciBuildIdOption)
    .addOption(machineIdOption)
    .addOption(specOption)
    .addOption(groupOption)
    .addOption(testTitleOption)
    .addOption(attemptOption)
    .addOption(runTypeOption)
    .addOption(captionOption)
    .addOption(metaOption)
    .addOption(debugOption())
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
    .summary('Upload test results, attach files, get or cancel a run')
    .description(
      'Upload test results to a run, attach files to it, get its data or cancel it'
    )
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
