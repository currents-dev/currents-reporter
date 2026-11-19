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
/** `--tag a --tag b` and `CURRENTS_TAG=a, b` hold the same tags. */
function sameListOrValue(value: unknown, envValue: string) {
  if (!Array.isArray(value)) return String(value) === envValue;
  const items = (list: string[]) =>
    list
      .map((item) => item.trim())
      .filter(Boolean)
      .join(',');
  return items(value.map(String)) === items(envValue.split(','));
}

export function warnOnOverriddenEnv(command: CommandUnknownOpts) {
  for (const option of command.options) {
    const name = option.attributeName();
    const envValue = option.envVar ? process.env[option.envVar] : undefined;
    const value = command.getOptionValue(name);
    if (
      !envValue ||
      option.isBoolean() ||
      command.getOptionValueSource(name) !== 'cli' ||
      sameListOrValue(value, envValue)
    ) {
      continue;
    }
    warnOnStderr(
      `${option.long} and ${option.envVar} are set to different values; using ${option.long}`
    );
  }
}

/**
 * Commander repeats the value of a rejected option, choice or command in its
 * error, which a CI log keeps: a token passed by mistake, such as
 * `--oidc-token=<jwt>` from a job written for an older CLI, would be printed
 * before any GitHub mask. The message is rebuilt from the error code and the
 * command's own options. Nothing is cut out of the text: an unknown option
 * name can be the token itself, and a value can hold any character.
 */
export function messageWithoutValues(
  command: CommandUnknownOpts,
  message: string,
  code?: string
) {
  switch (code) {
    case 'commander.unknownOption':
      return 'error: unknown option (run with --help to see the options)';
    case 'commander.invalidArgument': {
      const option = command.options.find((o) =>
        message.startsWith(`error: option '${o.flags}' argument `)
      );
      if (!option) return 'error: an option argument is invalid';
      // Commander writes "argument '<value>' is invalid. <reason>". The
      // reasons of the choices and of the CLI's parsers do not hold the value,
      // so the text after the last "is invalid." is the reason.
      const marker = "' is invalid.";
      const reason = message.slice(message.lastIndexOf(marker) + marker.length);
      return `error: option '${option.flags}' argument is invalid.${reason}`;
    }
    case 'commander.unknownCommand':
      return 'error: unknown command';
    default:
      return message;
  }
}

/** Applies messageWithoutValues to the command and every command under it. */
export function hideValuesInErrors(command: CommandUnknownOpts) {
  const error = command.error.bind(command);
  command.error = (message, options) =>
    error(messageWithoutValues(command, message, options?.code), options);
  command.commands.forEach(hideValuesInErrors);
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
  let exitCode = 0;
  try {
    if (commandOptions.debug) {
      enableDebug();
    }
    await action(commandOptions);
  } catch (e) {
    error((e as Error).message);
    exitCode = e instanceof CommanderError ? e.exitCode : 1;
  }
  process.exit(exitCode);
}

// commandHandler calls process.exit, which can cut off a write to a pipe that
// has not finished.
export function writeStdout(content: string) {
  return new Promise<void>((resolve, reject) =>
    process.stdout.write(content, (e) => (e ? reject(e) : resolve()))
  );
}
