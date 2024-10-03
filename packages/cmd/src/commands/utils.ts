import { CommanderError } from '@commander-js/extra-typings';
import { error, warnWithNoTrace } from '@logger';
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
  commandOptions: T,
  options?: {
    failOnError?: boolean;
  }
) {
  try {
    if (commandOptions.debug) {
      enableDebug();
    }
    await action(commandOptions);
    process.exit(0);
  } catch (_e) {
    const e = _e as Error;
    const failOnError = options?.failOnError ?? true;
    if (failOnError) {
      error(e.message);
    } else {
      warnWithNoTrace(e.message);
    }

    const exitCode = e instanceof CommanderError ? e.exitCode : 1;
    process.exit(failOnError ? exitCode : 0);
  }
}
