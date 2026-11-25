import { Command, Option } from '@commander-js/extra-typings';
import { sharedConfigKeys } from '../../config/keys';
import { watchRun } from '../../services/watch';
import type { TerminalRunEvent } from '../../services/watch/events';
import { createLinePrinter } from '../../services/watch/print';
import { WorkerStatsTracker } from '../../services/watch/workerStats';
import { createWorkersView } from '../../services/watch/workersView';
import {
  workerSummaryLines,
  workerTableLines,
} from '../../services/watch/workerText';
import { getConfiguredApiKey } from '../api/request';
import { apiKeyOption, debugOption } from '../options';
import { commandHandler } from '../utils';

/**
 * Beta: registered hidden until the terminal view is ready. Takes a personal
 * access token or an organization API key, and needs an API that accepts them
 * on GraphQL and takes the organization of the records from the credential.
 */
export const getWatchCommand = () => {
  const command = new Command()
    .name('watch')
    .summary('Follow a run while it runs')
    .description(
      'Print the tests of a run as they finish, from any machine, until the run ends'
    )
    .argument('<run-id>', 'the ID of the run')
    .addOption(
      new Option(
        '--view <view>',
        'lines: print each test and step; workers: show how busy each worker is, redrawn in place on a terminal'
      )
        .choices(['lines', 'workers'] as const)
        .default('lines' as const)
    )
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
        const stats = new WorkerStatsTracker();
        const printLine =
          opts.view === 'lines' ? createLinePrinter(console.log) : undefined;
        const view =
          opts.view === 'workers' && process.stdout.isTTY
            ? createWorkersView(stats, process.stdout)
            : undefined;
        const emit = (event: TerminalRunEvent) => {
          stats.add(event);
          printLine?.(event);
        };
        try {
          view?.start();
          await watchRun(apiKey, runId, emit);
        } finally {
          view?.stop();
        }
        // Off a terminal, the workers view prints its table once, at the end.
        if (opts.view === 'workers' && !view) {
          workerTableLines(stats.read(), {
            columns: Infinity,
            rows: Infinity,
          }).forEach((line) => console.log(line));
        }
        console.log('');
        workerSummaryLines(stats.read()).forEach((line) => console.log(line));
      }, options)
    );
  return command;
};
