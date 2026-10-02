import { Command } from '@commander-js/extra-typings';
import { reporterVersion } from '@env/versions';
import { getApiCommand } from '../commands/api';
import {
  getCacheCommand,
  getCacheGetExamples,
  getCacheSetExamples,
} from '../commands/cache';
import { getCancelCommand, getCancelExamples } from '../commands/cancel';
import { getConvertCommand } from '../commands/convert';
import { formatExamples } from '../commands/help';
import { getRunAttachExamples, getRunFilesCommand } from '../commands/run';
import { getSessionCommand, getSessionExamples } from '../commands/session';
import { getSkillCommand } from '../commands/skill';
import { getUploadCommand, getUploadExamples } from '../commands/upload';

const NAME = 'currents';
export const getProgram = () => {
  const program = new Command(NAME)
    .version(reporterVersion)
    .description(
      'Currents CLI: upload test results and files to Currents, get and cancel runs, share browser sessions, and cache files between CI jobs'
    )
    .showHelpAfterError(`(run '${NAME} --help' for usage)`)
    .addCommand(getUploadCommand(NAME), { hidden: true })
    .addCommand(getConvertCommand(NAME), { hidden: true })
    .addCommand(getCancelCommand(NAME, { deprecated: true }), { hidden: true })
    .addCommand(getRunFilesCommand(NAME))
    .addCommand(getSessionCommand(NAME))
    .addCommand(getCacheCommand(NAME))
    .addCommand(getApiCommand(NAME), { hidden: true })
    .addCommand(getSkillCommand(NAME))
    .addHelpText(
      'after',
      `${formatExamples([
        getUploadExamples(NAME)[0],
        getUploadExamples(NAME)[1],
        getCacheSetExamples(NAME)[1],
        getCacheGetExamples(NAME)[1],
        getCancelExamples(NAME)[0],
        getRunAttachExamples(NAME)[0],
        ...getSessionExamples(NAME).session,
      ])}
Run '${NAME} <command> --help' for the options and examples of a command.

Agent skill:   ${NAME} skill --install
Documentation: https://docs.currents.dev
Support:       support@currents.dev
`
    );

  const uploadHint = `upload is no longer the default command. Run '${NAME} run upload ...' instead.`;

  // Commander has no public hook for unknown options. Options such as --key
  // used to select the upload command, so point users to it.
  (program as unknown as { unknownOption: () => void }).unknownOption = () =>
    program.error(uploadHint);

  // A bare `currents` used to upload with the key and project from the
  // environment. Commander prints the help as an error when no command is
  // given; say why when those variables are set.
  program.addHelpText('before', ({ error }) =>
    error &&
    (process.env.CURRENTS_RECORD_KEY || process.env.CURRENTS_PROJECT_ID)
      ? `error: ${uploadHint}\n`
      : ''
  );

  return program;
};
