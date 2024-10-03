import { CommanderError } from '@commander-js/extra-typings';
import { ValidationError } from '@lib';
import { error, warnWithNoTrace } from '@logger';
import { isAxiosError } from 'axios';
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
  } catch (e) {
    const failOnError = options?.failOnError ?? true;

    if (
      e instanceof CommanderError ||
      e instanceof ValidationError ||
      isAxiosError(e)
    ) {
      if (failOnError) {
        error(e.message);
      } else {
        warnWithNoTrace(e.message);
      }
    } else {
      error('Script execution failed: %o', e);
    }

    const exitCode = e instanceof CommanderError ? e.exitCode : 1;
    process.exit(failOnError ? exitCode : 0);
  }
}
