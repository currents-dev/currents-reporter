import { Command } from '@commander-js/extra-typings';
import { reporterVersion } from '@env/versions';
import { getApiCommand } from '../commands/api';
import { getCacheCommand } from '../commands/cache';
import { getCancelCommand } from '../commands/cancel';
import { getRunFilesCommand } from '../commands/run';
import { getSessionCommand } from '../commands/session';
import { getUploadCommand } from '../commands/upload';
import { getConvertCommand } from '../commands/convert';

const example = `
----------------------------------------------------
📖 Documentation: https://docs.currents.dev
🤙 Support:       support@currents.dev
----------------------------------------------------
`;

const NAME = 'currents';
export const getProgram = () => {
  const program = new Command(NAME)
    .version(reporterVersion)
    .description(`Currents CLI ${example}`)
    .showHelpAfterError(`(run '${NAME} --help' for usage)`)
    .addCommand(getUploadCommand(NAME))
    .addCommand(getCacheCommand(NAME))
    .addCommand(getApiCommand(NAME))
    .addCommand(getCancelCommand(NAME))
    .addCommand(getConvertCommand(NAME))
    .addCommand(getSessionCommand(NAME))
    .addCommand(getRunFilesCommand(NAME));

  // Commander has no public hook for unknown options. Options such as --key
  // used to select the upload command, so point users to it.
  (program as unknown as { unknownOption: () => void }).unknownOption = () =>
    program.error(
      `upload is no longer the default command. Run '${NAME} upload ...' instead.`
    );

  return program;
};
