import { Command } from '@commander-js/extra-typings';
import fs from 'fs-extra';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { getProgram } from '../../bin/program';
import { getDocsFolder } from '../docs/docs';
import { getSkillFolder } from '../skill/skill';

const docsFolder = getDocsFolder();
const topics = fs
  .readdirSync(docsFolder)
  .filter((file) => file.endsWith('.md'))
  .map((file) => path.basename(file, '.md'));
const markdownFiles = [
  path.join(getSkillFolder(), 'SKILL.md'),
  ...topics.map((topic) => path.join(docsFolder, `${topic}.md`)),
];

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

// The text of the inline code spans outside the fenced code blocks.
function inlineCode(markdown: string) {
  return markdown
    .split(/^\s*```.*$[\s\S]*?^\s*```\s*$/m)
    .flatMap((text) => [...text.matchAll(/`([^`\n]+)`/g)].map((m) => m[1]));
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
  const problems: string[] = [];
  let i = 0;
  while (i < args.length) {
    const sub = command.commands.find((c) => c.name() === args[i]);
    if (!sub) break;
    // Hidden commands are the old paths of moved commands.
    if (!command.createHelp().visibleCommands(command).includes(sub)) {
      problems.push(`"${line}": "${args[i]}" is hidden from the help`);
    }
    command = sub as Command;
    i++;
  }
  const path = command === program ? 'currents' : command.name();
  // `currents <command> --help`, `currents session --help`
  const isPlaceholder = args[i]?.startsWith('<');
  const isHelp = args[i] === '--help' || args[i] === '-h';
  // `currents api <path>` has a hidden subcommand and takes a path.
  if (
    command.commands.length > 0 &&
    command.registeredArguments.length === 0 &&
    !isPlaceholder &&
    !isHelp
  ) {
    return [`"${line}": "${args[i]}" is not a command of ${path}`];
  }
  if (
    path === 'docs' &&
    args[i] &&
    !isPlaceholder &&
    !topics.includes(args[i])
  ) {
    problems.push(`"${line}": "${args[i]}" is not a topic of docs`);
  }
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

describe('commands in the skill and the guides', () => {
  const program = getProgram() as unknown as Command;
  const commands = markdownFiles.flatMap((filePath) => {
    const markdown = fs.readFileSync(filePath, 'utf8');
    const file = path.basename(filePath);
    return [...codeLines(markdown), ...inlineCode(markdown)]
      .flatMap(currentsCommands)
      .map((command) => ({ file, command }));
  });

  it('finds commands in every file', () => {
    for (const filePath of markdownFiles) {
      const file = path.basename(filePath);
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
    expect(checkCommand(program, 'run upload --key=x')).toEqual([]);
    expect(checkCommand(program, '<command> --help')).toEqual([]);
    expect(checkCommand(program, 'session --help')).toEqual([]);
    expect(checkCommand(program, 'docs ci-setup')).toEqual([]);
    expect(checkCommand(program, 'docs ci')).toEqual([
      '"docs ci": "ci" is not a topic of docs',
    ]);
    expect(checkCommand(program, 'api /v1/runs/<run-id> -X PUT')).toEqual([]);
    expect(checkCommand(program, 'api /v1/runs/<run-id> --branch x')).toEqual([
      '"api /v1/runs/<run-id> --branch x": --branch is not an option of api',
    ]);
  });

  it('reports a hidden legacy command', () => {
    expect(checkCommand(program, 'upload --key=x')).toEqual([
      '"upload --key=x": "upload" is hidden from the help',
    ]);
    expect(checkCommand(program, 'api get-run --api-key x')).toEqual([
      '"api get-run --api-key x": "get-run" is hidden from the help',
    ]);
    expect(checkCommand(program, 'cancel')).not.toEqual([]);
    expect(checkCommand(program, 'convert')).not.toEqual([]);
  });
});
