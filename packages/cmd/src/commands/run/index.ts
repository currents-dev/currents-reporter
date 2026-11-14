import { Command } from '@commander-js/extra-typings';
import { getRunAttachConfig, getRunShareConfig } from '../../config/session';
import { handleRunAttach, handleRunShare } from '../../services/session';
import { getRunGetCommand, getRunGetExamples } from '../api';
import { getCancelCommand, getCancelExamples } from '../cancel';
import { formatExamples, HelpExample } from '../help';
import { commandHandler } from '../utils';
import {
  apiKeyOption,
  debugOption,
  projectOption,
  oidcTokenOption,
  recordKeyOption,
} from '../options';
import {
  API_KEY_NOTE,
  attemptOption,
  captionOption,
  ciBuildIdOption,
  groupOption,
  instanceIdOption,
  machineIdOption,
  metaOption,
  PATHS_DESCRIPTION,
  purposeOption,
  RECORD_KEY_NOTE,
  runTypeOption,
  shareAttemptOption,
  shareExpiresInDaysOption,
  specOption,
  testIdOption,
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
    .addOption(oidcTokenOption())
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

export const getRunShareExamples = (name: string): HelpExample[] => {
  const share = `${name} ${COMMAND_NAME} share <run-id>`;
  const test = `${share} --instance-id <instance-id> --test-id <test-id> --purpose fix`;
  return [
    {
      comment:
        'Share a whole run with a reviewer or a colleague outside Currents',
      commands: [share],
    },
    {
      comment: 'Give an agent the failures of a whole run',
      commands: [`${share} --purpose fix`],
    },
    {
      comment:
        'Share one spec file, e.g. the copy that ran in the firefox group',
      commands: [`${share} --instance-id <instance-id>`],
    },
    {
      comment: 'Give an agent one failing test (its last failed attempt)',
      commands: [test],
    },
    {
      comment: 'Give an agent one specific attempt of a test',
      commands: [`${test} --attempt 0`],
    },
  ];
};

const getShareCommand = (name: string) =>
  new Command()
    .name('share')
    .usage('<run-id> [options]')
    .summary('Print a public link to a run, a spec file or a test')
    .description(
      'Create a public link to a run, or to one spec file or test of it, and print it. The second line, "Markdown: <url>", is the same content as Markdown, for agents'
    )
    .addHelpText('after', formatExamples(getRunShareExamples(name)))
    .argument('<run-id>', 'the run to share')
    .addOption(instanceIdOption)
    .addOption(testIdOption)
    .addOption(shareAttemptOption)
    .addOption(purposeOption)
    .addOption(shareExpiresInDaysOption)
    .addOption(apiKeyOption('(required; needs write access)'))
    .addOption(debugOption())
    .action(async (runId, options) => {
      await commandHandler(async (opts) => {
        await handleRunShare(getRunShareConfig({ ...opts, runId }));
      }, options);
    });

export const getRunFilesCommand = (name: string) =>
  new Command()
    .name(COMMAND_NAME)
    .summary('Upload results, attach files, get, share or cancel a run')
    .description(
      'Upload test results to a run, attach files to it, get its data, share a link to it or cancel it'
    )
    .addHelpText(
      'after',
      formatExamples([
        ...getUploadExamples(name).slice(0, 2),
        getRunAttachExamples(name)[0],
        getRunGetExamples(name)[0],
        getRunShareExamples(name)[0],
        getCancelExamples(name)[0],
      ])
    )
    .showHelpAfterError('(add --help for additional information)')
    .addCommand(getUploadCommand(name))
    .addCommand(getAttachCommand(name))
    .addCommand(getRunGetCommand(name))
    .addCommand(getShareCommand(name))
    .addCommand(getCancelCommand(name));
