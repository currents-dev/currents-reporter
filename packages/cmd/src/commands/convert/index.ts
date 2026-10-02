import { Command } from '@commander-js/extra-typings';
import { formatExamples, HelpExample } from '../help';
import { convertHandler } from './convert';
import {
  debugOption,
  frameworkOption,
  frameworkVersionOption,
  inputFileOption,
  inputFormatOption,
  outputDirOption,
} from './options';

const COMMAND_NAME = 'convert';

export const getConvertExamples = (name: string): HelpExample[] => [
  {
    comment: 'Convert JUnit test reports to the Currents format',
    commands: [
      `${name} ${COMMAND_NAME} --input-format junit --input-file ./*.xml --framework postman`,
    ],
  },
];

export const getConvertCommand = (name: string) => {
  const command = new Command()
    .name(COMMAND_NAME)
    .command(COMMAND_NAME)
    .showHelpAfterError('(add --help for additional information)')
    .allowUnknownOption()
    .summary('Convert test reports, e.g. JUnit, to the Currents format')
    .description(
      'Convert reports from various testing frameworks to the Currents format'
    )
    .addHelpText('after', formatExamples(getConvertExamples(name)))
    .addOption(debugOption)
    .addOption(inputFormatOption)
    .addOption(inputFileOption)
    .addOption(outputDirOption)
    .addOption(frameworkOption)
    .addOption(frameworkVersionOption)
    .action((options) => convertHandler(options));

  return command;
};
