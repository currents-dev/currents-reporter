import { Command } from '@commander-js/extra-typings';
import { dim } from '@logger';
import chalk from 'chalk';
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

const getExample = (name: string) => `

${chalk.bold('Examples')}

Convert JUnit test reports to Currents format:
${dim(`${name} ${COMMAND_NAME} --input-format junit --input-file ./*.xml --framework postman`)}
`;

export const getConvertCommand = (name: string) => {
  const command = new Command()
    .name(COMMAND_NAME)
    .command(COMMAND_NAME)
    .showHelpAfterError('(add --help for additional information)')
    .allowUnknownOption()
    .description(
      `Convert reports from various testing frameworks to Currents format
${getExample(name)}`
    )
    .addOption(debugOption)
    .addOption(inputFormatOption)
    .addOption(inputFileOption)
    .addOption(outputDirOption)
    .addOption(frameworkOption)
    .addOption(frameworkVersionOption)
    .action((options) => convertHandler(options));

  return command;
};
