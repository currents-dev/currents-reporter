import { Command } from '@commander-js/extra-typings';
import { formatExamples, HelpExample } from '../help';
import {
  ciBuildIdOption,
  debugOption,
  disableTitleTagsOption,
  machineIdOption,
  projectOption,
  recordKeyOption,
  removeTagOption,
  reportDirOption,
  tagOption,
} from './options';
import { uploadHandler } from './upload';

const COMMAND_NAME = 'upload';

export const getUploadExamples = (name: string): HelpExample[] => [
  {
    comment: 'Upload test results to Currents',
    commands: [
      `${name} ${COMMAND_NAME} --key <record-key> --project-id <id> --ci-build-id <build-id>`,
    ],
  },
  {
    comment:
      'Upload test results and add the tags "tagA" and "tagB" to the run',
    commands: [
      `${name} ${COMMAND_NAME} --key <record-key> --project-id <id> --ci-build-id <build-id> --tag tagA --tag tagB`,
    ],
  },
  {
    comment: 'Upload test results from a custom reports directory',
    commands: [
      `${name} ${COMMAND_NAME} --key <record-key> --project-id <id> --ci-build-id <build-id> --report-dir <report-dir>`,
    ],
  },
];

export const getUploadCommand = (name: string) => {
  const command = new Command()
    .name(COMMAND_NAME)
    .command(COMMAND_NAME)
    .showHelpAfterError('(add --help for additional information)')
    .allowUnknownOption()
    .summary('Upload test results created by Currents reporters')
    .description(
      'Upload test results created by Currents reporters to https://currents.dev'
    )
    .addHelpText('after', formatExamples(getUploadExamples(name)))
    .addOption(ciBuildIdOption)
    .addOption(recordKeyOption)
    .addOption(projectOption)
    .addOption(tagOption)
    .addOption(removeTagOption)
    .addOption(disableTitleTagsOption)
    .addOption(machineIdOption)
    .addOption(debugOption)
    .addOption(reportDirOption)
    .action((options) => uploadHandler(options));

  return command;
};
