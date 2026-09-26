/**
 * Exit codes of the account commands (`signup`, `login`, `whoami`, `logout`).
 * An agent branches on these, so a value never changes meaning.
 */
export const ExitCode = {
  ok: 0,
  unexpected: 1,
  /** The person has not acted yet: confirm the email or approve in the browser. */
  waitingForPerson: 2,
  /** No stored login, or the API no longer accepts it. */
  notLoggedIn: 3,
  /** The API refused the request: address not allowed, or rate limited. */
  refused: 4,
  accountExists: 5,
} as const;

export type ExitCodeValue = (typeof ExitCode)[keyof typeof ExitCode];

/** A command to run next, and why. Printed in text output and in `--json`. */
export type NextStep = { command: string; why: string };

export type CommandResult<T> = {
  data: T;
  /** Lines for text output. `--json` prints `data` instead. */
  text: string[];
  nextSteps?: NextStep[];
  exitCode?: ExitCodeValue;
};

export class CommandFailure extends Error {
  constructor(
    /** Stable, for `--json` readers. */
    readonly code: string,
    message: string,
    readonly exitCode: ExitCodeValue,
    readonly hint?: string,
    readonly nextSteps: NextStep[] = []
  ) {
    super(message);
  }
}

/** `dana@acme.com` → `da***@acme.com`, for output that may be logged. */
export function maskEmail(email: string) {
  const [local, domain] = email.split('@');
  if (!domain) {
    return email;
  }
  return `${local.slice(0, Math.min(2, local.length))}***@${domain}`;
}
