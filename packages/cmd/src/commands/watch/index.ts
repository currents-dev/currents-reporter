import {
  Command,
  InvalidArgumentError,
  Option,
} from '@commander-js/extra-typings';
import { sharedConfigKeys } from '../../config/keys';
import { watchRun } from '../../services/watch';
import type {
  RunEndStatus,
  TerminalRunEvent,
} from '../../services/watch/events';
import { estimateMachineCounts } from '../../services/watch/machineCount';
import {
  costSoFarLine,
  machineCountLines,
  runCostLine,
} from '../../services/watch/machineCostText';
import { createLinePrinter } from '../../services/watch/print';
import { runCost } from '../../services/watch/runCost';
import { WorkerStatsTracker } from '../../services/watch/workerStats';
import { createWorkersView } from '../../services/watch/workersView';
import {
  workerSummaryLines,
  workerTableLines,
} from '../../services/watch/workerText';
import { getConfiguredApiKey } from '../api/request';
import { apiKeyOption, debugOption } from '../options';
import { commandHandler } from '../utils';

const COST_LINE_INTERVAL_MS = 60_000;

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
    .addOption(
      new Option(
        '--price-per-minute <usd>',
        'show what the run costs at this price of one machine per minute, in USD. The price is your input. Machine time is estimated from test timing: each machine that ran a test counts from the start of the first test of the run to the end of the last one, and CI start-up and install time are not seen'
      ).argParser(parsePrice)
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
        const price = opts.pricePerMinute;
        const costLine = (format: typeof costSoFarLine) => {
          const { workers, windowMs } = stats.read();
          if (price === undefined || !windowMs) return [];
          return [format(runCost(workers, windowMs, price))];
        };
        const printLine =
          opts.view === 'lines' ? createLinePrinter(console.log) : undefined;
        const view =
          opts.view === 'workers' && process.stdout.isTTY
            ? createWorkersView(stats, process.stdout, () =>
                costLine(costSoFarLine)
              )
            : undefined;
        // The lines view prints the cost every minute, on a terminal only:
        // a CI log gets the cost at the end.
        const costTimer =
          printLine && price !== undefined && process.stdout.isTTY
            ? setInterval(
                () => costLine(costSoFarLine).forEach((l) => console.log(l)),
                COST_LINE_INTERVAL_MS
              )
            : undefined;
        const emit = (event: TerminalRunEvent) => {
          stats.add(event);
          printLine?.(event);
        };
        try {
          view?.start();
          await watchRun(apiKey, runId, emit);
        } finally {
          clearInterval(costTimer);
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
        const final = stats.read();
        [
          ...workerSummaryLines(final),
          ...costLine(runCostLine),
          ...machineCountText(final.runStatus, final.windowMs),
        ].forEach((line) => console.log(line));

        function machineCountText(
          status: RunEndStatus | undefined,
          windowMs: number
        ) {
          // A cancelled or timed-out run did not run all its tests.
          if (status !== 'passed' && status !== 'failed') return [];
          const estimate = estimateMachineCounts(stats.endedAttempts());
          return estimate ? ['', ...machineCountLines(estimate, windowMs)] : [];
        }
      }, options)
    );
  return command;
};

function parsePrice(value: string) {
  const price = Number(value);
  if (!value.trim() || !Number.isFinite(price) || price < 0) {
    throw new InvalidArgumentError('A price of zero or more is expected.');
  }
  return price;
}
