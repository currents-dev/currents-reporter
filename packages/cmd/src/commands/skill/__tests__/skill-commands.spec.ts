import { Command } from '@commander-js/extra-typings';
import fs from 'fs-extra';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { getProgram } from '../../../bin/program';

const skillFolder = path.resolve(
  __dirname,
  '../../../../../../skills/currents-cli'
);
const skillFiles = fs
  .readdirSync(skillFolder, { recursive: true, encoding: 'utf8' })
  .filter((file) => file.endsWith('.md'));

// The lines of the fenced code blocks, with the lines that end in "\" joined
// to the next one.
function codeLines(markdown: string) {
  const lines: string[] = [];
  let inBlock = false;
  let pending = '';
  for (const line of markdown.split('\n')) {
    if (line.trimStart().startsWith('```')) {
      inBlock = !inBlock;
      continue;
    }
    if (!inBlock) continue;
    if (line.trimEnd().endsWith('\\')) {
      pending += line.trimEnd().slice(0, -1) + ' ';
      continue;
    }
    lines.push(pending + line);
    pending = '';
  }
  return lines;
}

// The currents commands in a line: "currents ..." at the start of a line, or
// after "npx" or "npx --package @currents/cmd", up to the end of the shell
// command.
function currentsCommands(line: string) {
  const pattern =
    /(?:^\s*|\bnpx\s+(?:--package\s+@currents\/cmd\s+)?)currents\s+([^;&|]*)/g;
  return [...line.matchAll(pattern)].map((m) => m[1].trim());
}

function words(command: string) {
  return command.match(/"[^"]*"|'[^']*'|\S+/g) ?? [];
}

function findOption(command: Command, flag: string) {
  return command.options.find((o) => o.long === flag || o.short === flag);
}

// Returns the problems found in one command line, or an empty list.
function checkCommand(program: Command, line: string) {
  let command: Command = program;
  const args = words(line);
  let i = 0;
  while (i < args.length) {
    const sub = command.commands.find((c) => c.name() === args[i]);
    if (!sub) break;
    command = sub as Command;
    i++;
  }
  const path = command === program ? 'currents' : command.name();
  if (command.commands.length > 0) {
    return [`"${line}": "${args[i]}" is not a command of ${path}`];
  }
  const problems: string[] = [];
  for (const word of args.slice(i)) {
    if (!word.startsWith('-')) continue;
    const flag = word.split('=')[0];
    if (flag === '--help' || flag === '-h') continue;
    if (!findOption(command, flag)) {
      problems.push(`"${line}": ${flag} is not an option of ${path}`);
    }
  }
  return problems;
}

describe('commands in the currents-cli skill', () => {
  const program = getProgram() as unknown as Command;
  const commands = skillFiles.flatMap((file) =>
    codeLines(fs.readFileSync(path.join(skillFolder, file), 'utf8'))
      .flatMap(currentsCommands)
      .map((command) => ({ file, command }))
  );

  it('finds commands in every file', () => {
    for (const file of skillFiles) {
      expect(commands.some((c) => c.file === file)).toBe(true);
    }
  });

  it.each(commands)('$file: currents $command', ({ command }) => {
    expect(checkCommand(program, command)).toEqual([]);
  });

  it('reports a command or an option that does not exist', () => {
    expect(checkCommand(program, 'sesion start')).not.toEqual([]);
    expect(checkCommand(program, 'session')).not.toEqual([]);
    expect(checkCommand(program, 'run attach --test-name x a.png')).toEqual([
      '"run attach --test-name x a.png": --test-name is not an option of attach',
    ]);
    expect(checkCommand(program, 'upload --key=x')).toEqual([]);
  });
});
