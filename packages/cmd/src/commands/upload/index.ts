import { Command } from '@commander-js/extra-typings';
import {
  frameworkOption,
  frameworkVersionOption,
  inputFileOption,
  inputFormatOption,
  outputDirOption,
} from '../convert/options';
import { formatExamples, HelpExample } from '../help';
import { debugOption, projectOption, recordKeyOption } from '../options';
import {
  ciBuildIdOption,
  disableTitleTagsOption,
  machineIdOption,
  removeTagOption,
  reportDirOption,
  runTagOption,
} from './options';
import { uploadHandler } from './upload';

const COMMAND_NAME = 'upload';
const REQUIRED_WITH_INPUT_FORMAT = '(required with --input-format)';
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
    comment: 'Upload test results from another folder',
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
    .summary('Upload test results of Currents reporters or JUnit')
    .description(
      `Upload test results created by Currents reporters to https://currents.dev

With --input-format, first convert the reports in --input-file to the Currents
format, then upload the converted reports. They are saved to --output-dir, or
--report-dir, or a new folder in .currents. A folder you name may hold only the
reports being converted.`
    )
    .addHelpText('after', formatExamples(getUploadExamples(name)))
    .addOption(ciBuildIdOption)
    .addOption(recordKeyOption())
    .addOption(projectOption())
    .addOption(runTagOption)
    .addOption(removeTagOption)
    .addOption(disableTitleTagsOption)
    .addOption(machineIdOption)
    .addOption(debugOption())
    .addOption(reportDirOption)
    .addOption(inputFormatOption())
    .addOption(inputFileOption(REQUIRED_WITH_INPUT_FORMAT))
    .addOption(frameworkOption(REQUIRED_WITH_INPUT_FORMAT))
    .addOption(frameworkVersionOption)
    .addOption(outputDirOption)
    .action((options) => uploadHandler(options));

  return command;
};
