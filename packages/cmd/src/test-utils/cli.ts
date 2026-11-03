import { execFile } from 'child_process';
import { pick } from 'lodash';
import { join } from 'path';

// The built CLI. Pointing this at another build compares the two, e.g. the one
// on main.
export const cliPath =
  process.env.CURRENTS_TEST_CLI ?? join(__dirname, '../../dist/bin/index.js');

export type CliResult = { code: number; stdout: string; stderr: string };

/**
 * Runs the built CLI. Only PATH and HOME are passed on from the current
 * environment, so CI variables and CURRENTS_* variables of the machine running
 * the tests do not change the result.
 *
 * `maxOpenFiles` runs the CLI under `ulimit -n`. It is set with bash, which
 * lowers the hard limit too: Node.js raises a lower soft limit to the hard one.
 */
export function runCli(
  args: string[],
  options: { cwd: string; env?: Record<string, string>; maxOpenFiles?: number }
): Promise<CliResult> {
  const command = [process.execPath, cliPath, ...args];
  const [file, ...fileArgs] = options.maxOpenFiles
    ? [
        'bash',
        '-c',
        `ulimit -n ${options.maxOpenFiles} && exec "$@"`,
        'bash',
        ...command,
      ]
    : command;
  return new Promise((resolve) => {
    execFile(
      file,
      fileArgs,
      {
        cwd: options.cwd,
        env: {
          ...pick(process.env, ['PATH', 'HOME']),
          ...options.env,
        },
      },
      (error, stdout, stderr) => {
        const code =
          error === null ? 0 : typeof error.code === 'number' ? error.code : 1;
        resolve({ code, stdout, stderr });
      }
    );
  });
}
