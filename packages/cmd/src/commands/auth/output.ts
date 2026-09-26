import { dim, error, info } from '@logger';
import { enableDebug } from '../../debug';
import {
  CommandFailure,
  CommandResult,
  ExitCode,
  NextStep,
} from '../../services/auth/result';

type Progress = (line: string, fields: Record<string, unknown>) => void;

/**
 * With `--json`, stdout carries exactly one object, and progress goes to
 * stderr as one JSON object per line.
 */
export const progressFor =
  (json: boolean): Progress =>
  (line, fields) => {
    if (json) {
      process.stderr.write(`${JSON.stringify(fields)}\n`);
    } else {
      info(line);
    }
  };

const nextStepsJson = (steps: NextStep[] = []) =>
  steps.map(({ command, why }) => ({ command, why }));

function printNextSteps(steps: NextStep[] = []) {
  if (!steps.length) {
    return;
  }
  info('\nNext:');
  for (const step of steps) {
    info(`  ${step.command}  ${dim(`# ${step.why}`)}`);
  }
}

/** Runs an account command, prints its result or failure, and exits. */
export async function runAccountCommand(
  action: () => Promise<CommandResult<unknown>>,
  { json, debug }: { json: boolean; debug?: boolean }
) {
  if (debug) {
    enableDebug();
  }
  try {
    const result = await action();
    if (json) {
      process.stdout.write(
        `${JSON.stringify({
          ok: true,
          data: result.data,
          next_steps: nextStepsJson(result.nextSteps),
        })}\n`
      );
    } else {
      result.text.forEach((line) => info(line));
      printNextSteps(result.nextSteps);
    }
    process.exit(result.exitCode ?? ExitCode.ok);
  } catch (e) {
    const failure =
      e instanceof CommandFailure
        ? e
        : new CommandFailure(
            'unexpected',
            (e as Error).message,
            ExitCode.unexpected
          );
    if (json) {
      process.stdout.write(
        `${JSON.stringify({
          ok: false,
          error: {
            code: failure.code,
            message: failure.message,
            hint: failure.hint ?? null,
          },
          next_steps: nextStepsJson(failure.nextSteps),
        })}\n`
      );
    } else {
      error(failure.message);
      if (failure.hint) {
        info(failure.hint);
      }
      printNextSteps(failure.nextSteps);
    }
    process.exit(failure.exitCode);
  }
}
