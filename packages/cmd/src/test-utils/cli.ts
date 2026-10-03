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
 */
export function runCli(
  args: string[],
  options: { cwd: string; env?: Record<string, string> }
): Promise<CliResult> {
  return new Promise((resolve) => {
    execFile(
      process.execPath,
      [cliPath, ...args],
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
