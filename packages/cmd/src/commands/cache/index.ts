import { Command } from '@commander-js/extra-typings';
import { formatExamples, HelpExample } from '../help';
import { getCacheGetHandler } from './get';
import {
  continueGetOption,
  continueSetOption,
  debugOption,
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
const getSetExamples = (name: string): HelpExample[] => [
  {
    comment: 'Save files to the cache under an ID',
    commands: [
      `${name} ${COMMAND_NAME} set --key <record-key> --id <id> --path <path-1,path-2,...path-n>`,
    ],
  },
  {
    comment: 'Save the data of the last run to the cache',
    commands: [
      `${name} ${COMMAND_NAME} set --key <record-key> --preset last-run`,
    ],
  },
];

const getGetExamples = (name: string): HelpExample[] => [
  {
    comment: 'Restore the files saved in the cache under an ID',
    commands: [`${name} ${COMMAND_NAME} get --key <record-key> --id <id>`],
  },
  {
    comment: 'Restore the data of the last run from the cache',
    commands: [
      `${name} ${COMMAND_NAME} get --key <record-key> --preset last-run`,
    ],
  },
  {
    comment: 'Restore the data of the last run to a custom directory',
    commands: [
      `${name} ${COMMAND_NAME} get --key <record-key> --preset last-run --output-dir <output-dir>`,
    ],
  },
];

export const getCacheCommand = (name: string) => {
  const command = new Command()
    .command(COMMAND_NAME)
    .summary('Save files to the Currents cache and restore them')
    .description(
      'Save files to the Currents cache and restore them, e.g. in another CI job'
    )
    .addHelpText(
      'after',
      formatExamples([...getSetExamples(name), ...getGetExamples(name)])
    )
    .showHelpAfterError('(add --help for additional information)')
    .allowUnknownOption()
    .addCommand(getCacheSetCommand(name))
    .addCommand(getCacheGetCommand(name));

  return command;
};

export const getCacheSetCommand = (name: string) => {
  const command = new Command()
    .name('set')
    .description('Save files to the cache')
    .addHelpText('after', formatExamples(getSetExamples(name)))
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
    .action(getCacheSetHandler);

  return command;
};

export const getCacheGetCommand = (name: string) => {
  const command = new Command()
    .name('get')
    .description('Restore files from the cache')
    .addHelpText('after', formatExamples(getGetExamples(name)))
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
