import { Command } from '@commander-js/extra-typings';
import { reporterVersion } from '@env/versions';
import { getApiCommand } from '../commands/api';
import { getCacheCommand } from '../commands/cache';
import { getCancelCommand } from '../commands/cancel';
import { getConvertCommand } from '../commands/convert';
import { formatExamples } from '../commands/help';
import { getRunFilesCommand } from '../commands/run';
import { getSessionCommand } from '../commands/session';
import { getUploadCommand } from '../commands/upload';

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
    .addCommand(getCancelCommand(NAME))
    .addCommand(getRunFilesCommand(NAME))
    .addCommand(getSessionCommand(NAME))
    .addCommand(getCacheCommand(NAME))
    .addCommand(getApiCommand(NAME))
    .addHelpText(
      'after',
      `${formatExamples([
        {
          comment: 'Upload test results to Currents',
          commands: [
            `${NAME} upload --key <record-key> --project-id <id> --ci-build-id <build-id>`,
          ],
        },
      ])}
Run '${NAME} <command> --help' for the options and examples of a command.

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
