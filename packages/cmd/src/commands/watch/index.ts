import { Command, Option } from '@commander-js/extra-typings';
import { sharedConfigKeys } from '../../config/keys';
import { watchRun } from '../../services/watch';
import type { TerminalRunEvent } from '../../services/watch/events';
import { toJsonLine } from '../../services/watch/json';
import { createLinePrinter } from '../../services/watch/print';
import { getConfiguredApiKey } from '../api/request';
import { apiKeyOption, debugOption } from '../options';
import { commandHandler, printLogsToStderr, writeStdout } from '../utils';

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
    .addOption(apiKeyOption())
    .addOption(
      new Option(
        '--json',
        'print each event as one line of JSON on stdout, and errors on stderr'
      )
    )
    .addOption(debugOption())
    .addHelpText('after', JSON_HELP)
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
        if (!opts.json) {
          return watchRun(apiKey, runId, createLinePrinter(console.log));
        }
        printLogsToStderr();
        // An agent that stops reading, as with `| head`, closes the pipe.
        process.stdout.on('error', (e: NodeJS.ErrnoException) => {
          if (e.code !== 'EPIPE') throw e;
          process.exit(0);
        });
        let written = Promise.resolve();
        const emit = (event: TerminalRunEvent) =>
          (written = written.then(() => writeStdout(`${toJsonLine(event)}\n`)));
        try {
          await watchRun(apiKey, runId, emit);
        } finally {
          await written;
        }
      }, options)
    );
  return command;
};

const JSON_HELP = `
JSON output (--json):
  Each line on stdout is one event: runBegin, testBegin, stepBegin, stepEnd,
  testEnd and runEnd. A testEnd has the title, file and project of its test,
  and for a failed test the error, where it was thrown and the code around it,
  without colour codes. An agent can read the first failed testEnd and act on
  it while the run continues. Example:
  {"type":"testEnd","testId":"QPaKOa9eCT8yYzib","title":["billing","adds an invoice"],"file":"billing.spec.ts","project":"chromium","status":"failed","durationMs":12660,"retry":0,"error":"Error: invoice row is missing\\n\\nExpected: 2\\nReceived: 1","errorDetail":{"location":{"file":"tests/billing.spec.ts","line":34},"snippet":"> 34 |   expect(rows).toBe(2);"}}
`;
