import { CommanderError } from '@commander-js/extra-typings';
import { error } from '@logger';
import { enableDebug } from '../debug';

export function parseCommaSeparatedList(
  value: string,
  previous: string[] = []
) {
  if (value) {
    return previous.concat(value.split(',').map((t) => t.trim()));
  }
  return previous;
}

export async function commandHandler<T extends Record<string, unknown>>(
  action: (options: T) => Promise<void>,
  commandOptions: T
) {
  try {
    if (commandOptions.debug) {
      enableDebug();
    }
    await action(commandOptions);
    process.exit(0);
  } catch (e) {
    console.log("ERR::", e)
    error((e as Error).message);
    const exitCode = e instanceof CommanderError ? e.exitCode : 1;
    process.exit(exitCode);
  }
}
