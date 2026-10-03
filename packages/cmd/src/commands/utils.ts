import {
  CommanderError,
  CommandUnknownOpts,
} from '@commander-js/extra-typings';
import { error, warnOnStderr } from '@logger';
import { parseBooleanEnv } from '../config/utils';
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

/**
 * Commander sets a flag that has an environment variable to true when the
 * variable holds any value, so `CURRENTS_DEBUG=false` would turn debug on.
 * Reads those values again with parseBooleanEnv. A flag given on the command
 * line keeps its value.
 */
export function parseFlagsFromEnv(command: CommandUnknownOpts) {
  for (const option of command.options) {
    const name = option.attributeName();
    if (
      !option.envVar ||
      !option.isBoolean() ||
      command.getOptionValueSource(name) !== 'env'
    ) {
      continue;
    }
    const value = parseBooleanEnv(process.env[option.envVar]);
    command.setOptionValueWithSource(
      name,
      value ?? option.defaultValue,
      value === undefined ? 'default' : 'env'
    );
  }
}

/**
 * Up to 1.x an environment variable won over its command-line option; now the
 * option wins. When both are set to different values, say which one is used,
 * so a script that hard-codes `--project-id` and sets `CURRENTS_PROJECT_ID`
 * does not report to the other project without notice. Values are not
 * printed: one of them can be a key.
 */
export function warnOnOverriddenEnv(command: CommandUnknownOpts) {
  for (const option of command.options) {
    const name = option.attributeName();
    const envValue = option.envVar ? process.env[option.envVar] : undefined;
    const value = command.getOptionValue(name);
    if (
      !envValue ||
      option.isBoolean() ||
      command.getOptionValueSource(name) !== 'cli' ||
      String(value) === envValue
    ) {
      continue;
    }
    warnOnStderr(
      `${option.long} and ${option.envVar} are set to different values; using ${option.long}`
    );
  }
}

/**
 * The logger prints to stdout. A command that prints JSON on stdout calls this
 * first, so that warnings such as a retried request go to stderr and the JSON
 * can be piped.
 */
export function printLogsToStderr() {
  console.log = (...args: unknown[]) => console.error(...args);
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
    error((e as Error).message);
    const exitCode = e instanceof CommanderError ? e.exitCode : 1;
    process.exit(exitCode);
  }
}
