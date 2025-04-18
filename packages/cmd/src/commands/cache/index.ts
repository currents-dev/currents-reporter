import { Command } from '@commander-js/extra-typings';
import { dim } from '@logger';
import chalk from 'chalk';
import { getCacheGetHandler } from './get';
import {
  continueGetOption,
  continueSetOption,
  debugOption,
  saveToHistoryOption,
  idOption,
  matrixIndexOption,
  matrixTotalOption,
  outputDirOption,
  pathOption,
  presetOption,
  presetOutputOption,
  pwOutputDirOption,
  recordKeyOption,
} from './options';
import { getCacheSetHandler } from './set';

const COMMAND_NAME = 'cache';
const getExample = (name: string) => `

${chalk.bold('Examples')}

Save files to the cache under a specific ID:
${dim(`${name} ${COMMAND_NAME} set --key <record-key> --id <id> --path <path-1,path-2,...path-n>`)}

Retrieve files from the cache saved under a specific ID:
${dim(`${name} ${COMMAND_NAME} get --key <record-key> --id <id>`)}

Store the last run data in the cache:
${dim(`${name} ${COMMAND_NAME} set --key <record-key> --preset last-run`)}

Retrieve the last run data from the cache:
${dim(`${name} ${COMMAND_NAME} get --key <record-key> --preset last-run`)}

Retrieve the last run data from the cache and save it to a custom directory:
${dim(`${name} ${COMMAND_NAME} get --key <record-key> --preset last-run --output-dir <outputDir>`)}

`;

export const getCacheCommand = (name: string) => {
  const command = new Command()
    .command(COMMAND_NAME)
    .description(`Cache data to Currents ${getExample(name)}`)
    .showHelpAfterError('(add --help for additional information)')
    .allowUnknownOption()
    .addCommand(getCacheSetCommand())
    .addCommand(getCacheGetCommand());

  return command;
};

export const getCacheSetCommand = () => {
  const command = new Command()
    .name('set')
    .allowUnknownOption()
    .addOption(recordKeyOption)
    .addOption(idOption)
    .addOption(presetOption)
    .addOption(pathOption)
    .addOption(debugOption)
    .addOption(pwOutputDirOption)
    .addOption(matrixIndexOption)
    .addOption(matrixTotalOption)
    .addOption(continueSetOption)
    .addOption(saveToHistoryOption)
    .action(getCacheSetHandler);

  return command;
};

export const getCacheGetCommand = () => {
  const command = new Command()
    .name('get')
    .allowUnknownOption()
    .addOption(recordKeyOption)
    .addOption(idOption)
    .addOption(presetOption)
    .addOption(outputDirOption)
    .addOption(presetOutputOption)
    .addOption(debugOption)
    .addOption(matrixIndexOption)
    .addOption(matrixTotalOption)
    .addOption(continueGetOption)
    .action(getCacheGetHandler);

  return command;
};
