import fs from 'fs-extra';
import os from 'os';
import { join } from 'path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { cliPath, runCli } from '../../test-utils/cli';

const commands = [
  'run',
  'run upload',
  'run attach',
  'run get',
  'run cancel',
  'cache',
  'cache get',
  'cache set',
  'api',
  'docs',
  'skill',
];

// Hidden from the root help, and still working.
const legacyCommands = ['upload', 'convert', 'api get-run', 'cancel'];

describe('command surface of the built CLI', () => {
  let cwd: string;

  beforeAll(async () => {
    if (!fs.existsSync(cliPath)) {
      throw new Error(`Build the CLI first: ${cliPath} is missing`);
    }
    cwd = await fs.mkdtemp(join(os.tmpdir(), 'currents-help-'));
  });

  afterAll(async () => {
    await fs.remove(cwd);
  });

  it('lists the commands of the root help', async () => {
    const { code, stdout } = await runCli(['--help'], { cwd });

    expect(code).toBe(0);
    expect(getCommandNames(stdout)).toEqual([
      'run',
      'session',
      'cache',
      'api',
      'docs',
      'skill',
      'help',
    ]);
    // The names come from the section parsing, not from the examples in it.
    expect(getCommandNames(stdout)).not.toContain('currents');
  });

  it('lists the commands of run', async () => {
    const { code, stdout } = await runCli(['run', '--help'], { cwd });

    expect(code).toBe(0);
    expect(getCommandNames(stdout)).toEqual([
      'upload',
      'attach',
      'get',
      'cancel',
      'help',
    ]);
  });

  it.each([...commands, ...legacyCommands])(
    'prints the help of %s',
    async (command) => {
      const { code, stdout } = await runCli([...command.split(' '), '--help'], {
        cwd,
      });

      expect(code).toBe(0);
      expect(stdout).toMatchSnapshot();
    }
  );
});

/**
 * Reads the names from the command sections of the help: "Commands:" or the
 * group headings of the root help, such as "Test runs:". A command line
 * starts with two spaces and the lowercase name, followed by the options and
 * arguments and at least two spaces before the description.
 */
function getCommandNames(help: string) {
  const sections = help
    .split(/\n\n(?=[A-Z][^\n]*:\n)/)
    .filter(
      (section) =>
        !/^(Usage|Options|Arguments|Examples):/.test(section) &&
        /^[A-Z][^\n]*:\n/.test(section)
    );
  return sections
    .flatMap((section) => section.split('\n').slice(1))
    .map(
      (line) =>
        line.match(/^ {2}([a-z][a-z-]*)(?: \[\w+\])?(?: <[^>]+>)?\s{2,}\S/)?.[1]
    )
    .filter((name): name is string => name !== undefined);
}
