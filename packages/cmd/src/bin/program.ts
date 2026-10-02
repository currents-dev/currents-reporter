import { Command } from '@commander-js/extra-typings';
import { reporterVersion } from '@env/versions';
import { getApiCommand } from '../commands/api';
import {
  getCacheCommand,
  getCacheGetExamples,
  getCacheSetExamples,
} from '../commands/cache';
import { getCancelCommand, getCancelExamples } from '../commands/cancel';
import { getConvertCommand, getConvertExamples } from '../commands/convert';
import { formatExamples } from '../commands/help';
import { getRunExamples, getRunFilesCommand } from '../commands/run';
import { getSessionCommand, getSessionExamples } from '../commands/session';
import { getSkillCommand } from '../commands/skill';
import { getUploadCommand, getUploadExamples } from '../commands/upload';

const NAME = 'currents';
export const getProgram = () => {
  const program = new Command(NAME)
    .version(reporterVersion)
    .description(
      'Currents CLI: report test results and attach files to Currents'
    )
    .showHelpAfterError(`(run '${NAME} --help' for usage)`)
    .addCommand(getUploadCommand(NAME))
    .addCommand(getConvertCommand(NAME))
    .addCommand(getCancelCommand(NAME, { deprecated: true }), { hidden: true })
    .addCommand(getRunFilesCommand(NAME))
    .addCommand(getSessionCommand(NAME))
    .addCommand(getCacheCommand(NAME))
    .addCommand(getApiCommand(NAME))
    .addCommand(getSkillCommand(NAME))
    .addHelpText(
      'after',
      `${formatExamples([
        getUploadExamples(NAME)[0],
        getConvertExamples(NAME)[0],
        getCacheSetExamples(NAME)[1],
        getCacheGetExamples(NAME)[1],
        getCancelExamples(NAME)[0],
        getRunExamples(NAME)[0],
        ...getSessionExamples(NAME).session,
      ])}
Run '${NAME} <command> --help' for the options and examples of a command.

Agent skill:   ${NAME} skill --install
Documentation: https://docs.currents.dev
Support:       support@currents.dev
`
    );

  // Commander has no public hook for unknown options. Options such as --key
  // used to select the upload command, so point users to it.
  (program as unknown as { unknownOption: () => void }).unknownOption = () =>
    program.error(
      `upload is no longer the default command. Run '${NAME} upload ...' instead.`
    );

  return program;
};
