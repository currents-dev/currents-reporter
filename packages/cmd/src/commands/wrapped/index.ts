import { Command, Option } from '@commander-js/extra-typings';
import { sharedConfigKeys } from '../../config/keys';
import fs from 'fs/promises';
import { getRunWrapped } from '../../services/wrapped';
import {
  cardRows,
  renderCard,
  renderCardSvg,
} from '../../services/wrapped/card';
import { getConfiguredApiKey } from '../api/request';
import { apiKeyOption, debugOption } from '../options';
import { commandHandler, writeStdout } from '../utils';

export const svgOption = <Flags extends string>(flags: Flags) =>
  new Option(flags, 'also write the card as an SVG image to <file>');

/** Beta: registered hidden, like `watch`, and needs the same API. */
export const getWrappedCommand = () => {
  const command = new Command()
    .name('wrapped')
    .summary('Show a card with highlights of a finished run')
    .description(
      'Print a card with highlights of a finished run: time saved by parallel workers, the busiest worker, the longest, flakiest and first failed test, and the slowest step. Steps are read for runs of up to 200 test attempts'
    )
    .argument('<run-id>', 'the ID of the run')
    .addOption(svgOption('--svg <file>'))
    .addOption(apiKeyOption())
    .addOption(debugOption())
    .action((runId, options) =>
      commandHandler(async (opts) => {
        await printRunWrapped(requireApiKey(command, opts.apiKey), runId, {
          svgPath: opts.svg,
          requireEnded: true,
        });
      }, options)
    );
  return command;
};

export function requireApiKey(
  command: Command<any, any, any>,
  apiKey?: string
) {
  const key = getConfiguredApiKey(
    apiKey,
    command.getOptionValueSource('apiKey')
  );
  if (!key) {
    throw new Error(
      `An API key is required: pass ${sharedConfigKeys.apiKey.cli} or set ${sharedConfigKeys.apiKey.env}`
    );
  }
  return key;
}

/** Prints the card, and writes it as SVG to `svgPath` when given. */
export async function printRunWrapped(
  apiKey: string,
  runId: string,
  { svgPath, requireEnded }: { svgPath?: string; requireEnded: boolean }
) {
  const rows = cardRows(await getRunWrapped(apiKey, runId, { requireEnded }));
  await writeStdout(`${renderCard(rows).join('\n')}\n`);
  if (svgPath) {
    await fs.writeFile(svgPath, renderCardSvg(rows));
    await writeStdout(`Wrote the card to ${svgPath}\n`);
  }
}
