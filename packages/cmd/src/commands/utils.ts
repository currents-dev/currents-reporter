import { CommanderError } from "@commander-js/extra-typings";
import { ValidationError } from "@lib";
import { error } from "@logger";
import { isAxiosError } from "axios";

export function parseCommaSeparatedList(
  value: string,
  previous: string[] = []
) {
  if (value) {
    return previous.concat(value.split(",").map((t) => t.trim()));
  }
  return previous;
}

export async function commandHandler<T extends object>(
  action: (options: T) => Promise<void>,
  options: T
) {
  try {
    await action(options);
    process.exit(0);
  } catch (e) {
    if (e instanceof CommanderError) {
      error(e.message);
      process.exit(e.exitCode);
    }

    if (e instanceof ValidationError) {
      error(e.message);
      process.exit(1);
    }

    if (isAxiosError(e)) {
      error(e.message);
      process.exit(1);
    }

    error("Script execution failed: %o", e);
    process.exit(1);
  }
}
