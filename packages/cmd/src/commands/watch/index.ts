import { Command, Option } from '@commander-js/extra-typings';
import { sharedConfigKeys } from '../../config/keys';
import { watchRun } from '../../services/watch';
import type { TerminalRunEvent } from '../../services/watch/events';
import { createLinePrinter } from '../../services/watch/print';
import { MachineStatsTracker } from '../../services/watch/machineStats';
import {
  heartbeatLines,
  machineMapLines,
  machineSummaryLines,
  raceLines,
} from '../../services/watch/machineText';
import {
  createRedrawView,
  type FrameLines,
} from '../../services/watch/redrawView';
import {
  workerSummaryLines,
  workerTableLines,
} from '../../services/watch/workerText';
import { getConfiguredApiKey } from '../api/request';
import { apiKeyOption, debugOption } from '../options';
import { commandHandler } from '../utils';

/** The width the machine views are drawn at when the output is not a terminal. */
const OFF_TERMINAL_COLUMNS = 100;

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
        'lines: print each test and step. The others are redrawn in place on a terminal: workers: how busy each worker is; heartbeat: one cell per machine, colored by its state; race: how far each machine got through its tests; machines: tests, speed, failures and current test of each machine'
      )
        .choices(['lines', 'workers', 'heartbeat', 'race', 'machines'] as const)
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
        const machines = new MachineStatsTracker();
        const frames: Partial<Record<typeof opts.view, FrameLines>> = {
          workers: (size) => workerTableLines(machines.workers.read(), size),
          heartbeat: (size) => heartbeatLines(machines.read(), size),
          race: (size) => raceLines(machines.read(), size),
          machines: (size) => machineMapLines(machines.read(), size),
        };
        const frame = frames[opts.view];
        const printLine =
          opts.view === 'lines' ? createLinePrinter(console.log) : undefined;
        const view =
          frame && process.stdout.isTTY
            ? createRedrawView(frame, process.stdout)
            : undefined;
        const emit = (event: TerminalRunEvent) => {
          machines.add(event);
          printLine?.(event);
        };
        try {
          view?.start();
          await watchRun(apiKey, runId, emit);
        } finally {
          view?.stop();
        }
        // Off a terminal, a redrawn view prints its last frame once, at the end.
        if (frame && !view) {
          frame({
            columns: opts.view === 'workers' ? Infinity : OFF_TERMINAL_COLUMNS,
            rows: Infinity,
          }).forEach((line) => console.log(line));
        }
        console.log('');
        const summary =
          opts.view === 'lines' || opts.view === 'workers'
            ? workerSummaryLines(machines.workers.read())
            : machineSummaryLines(machines.read());
        summary.forEach((line) => console.log(line));
      }, options)
    );
  return command;
};
