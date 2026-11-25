import { Command } from '@commander-js/extra-typings';
import { sharedConfigKeys } from '../../config/keys';
import { watchRun } from '../../services/watch';
import { createLinePrinter } from '../../services/watch/print';
import { getConfiguredApiKey } from '../api/request';
import { apiKeyOption, debugOption } from '../options';
import { commandHandler } from '../utils';

/**
 * Beta: registered hidden until the terminal view is ready. Takes a personal
 * access token or an organization API key, and needs an API that serves
 * `GET /stream/runs/:runId`.
 */
export const getWatchCommand = () => {
  const command = new Command()
    .name('watch')
    .summary('Follow a run while it runs')
    .description(
      'Print the tests of a run as they finish, from any machine, until the run ends'
    )
    .argument('<run-id>', 'the ID of the run')
    .addOption(apiKeyOption())
    .addOption(debugOption())
    .action((runId, options) =>
      commandHandler(async (opts) => {
        const apiKey = getConfiguredApiKey(
          opts.apiKey,
          command.getOptionValueSource('apiKey')
        );
        if (!apiKey) {
          throw new Error(
            `An API key is required: pass ${sharedConfigKeys.apiKey.cli} or set ${sharedConfigKeys.apiKey.env}`
          );
        }
        await watchRun(apiKey, runId, createLinePrinter(console.log));
      }, options)
    );
  return command;
};
