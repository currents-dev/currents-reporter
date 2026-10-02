import { Command } from '@commander-js/extra-typings';
import {
  frameworkOption,
  frameworkVersionOption,
  inputFileOption,
  inputFormatOption,
  outputDirOption,
} from '../convert/options';
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
const PARENT_NAME = 'run';

export const getUploadExamples = (name: string): HelpExample[] => [
  {
    comment: 'Upload test results to Currents',
    commands: [
      `${name} ${PARENT_NAME} ${COMMAND_NAME} --key <record-key> --project-id <id> --ci-build-id <build-id>`,
    ],
  },
  {
    comment:
      'Convert JUnit XML reports to the Currents format, then upload them',
    commands: [
      `${name} ${PARENT_NAME} ${COMMAND_NAME} --key <record-key> --project-id <id> --ci-build-id <build-id> --input-format junit --input-file "./*.xml" --framework postman`,
    ],
  },
  {
    comment:
      'Upload test results and add the tags "tagA" and "tagB" to the run',
    commands: [
      `${name} ${PARENT_NAME} ${COMMAND_NAME} --key <record-key> --project-id <id> --ci-build-id <build-id> --tag tagA --tag tagB`,
    ],
  },
  {
    comment: 'Upload test results from a custom reports directory',
    commands: [
      `${name} ${PARENT_NAME} ${COMMAND_NAME} --key <record-key> --project-id <id> --ci-build-id <build-id> --report-dir <report-dir>`,
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
      `Upload test results created by Currents reporters to https://currents.dev

With --input-format, first convert the reports in --input-file to the Currents
format, then upload the converted reports. They are saved to --output-dir, or
--report-dir, or a new folder in .currents.`
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
    .addOption(inputFormatOption)
    .addOption(inputFileOption)
    .addOption(frameworkOption)
    .addOption(frameworkVersionOption)
    .addOption(outputDirOption)
    .action((options) => uploadHandler(options));

  return command;
};
