import { dim } from '@logger';

export type HelpExample = {
  comment: string;
  // One string per command. A string with line breaks is printed as is.
  commands: string[];
};

const WIDTH = 80;
const INDENT = '  ';
const CONTINUATION_INDENT = '      ';

// Splits a command into words, keeping quoted text and "--option value"
// pairs together so that a line break never separates them.
function commandParts(command: string) {
  const words = command.match(/"[^"]*"|'[^']*'|\S+/g) ?? [];
  const parts: string[] = [];
  for (const word of words) {
    const previous = parts[parts.length - 1];
    if (
      previous?.startsWith('-') &&
      !previous.includes(' ') &&
      !word.startsWith('-')
    ) {
      parts[parts.length - 1] = `${previous} ${word}`;
    } else {
      parts.push(word);
    }
  }
  return parts;
}

// Wraps a shell command to WIDTH columns, ending each broken line with " \".
function wrapCommand(command: string) {
  if (command.includes('\n')) {
    return command.split('\n').map((line) => INDENT + line);
  }
  const lines: string[] = [];
  let line = INDENT;
  for (const part of commandParts(command)) {
    const isLineStart = line.trim() === '';
    if (!isLineStart && line.length + 1 + part.length + 2 > WIDTH) {
      lines.push(`${line} \\`);
      line = CONTINUATION_INDENT + part;
    } else {
      line = isLineStart ? line + part : `${line} ${part}`;
    }
  }
  return [...lines, line];
}

function wrapComment(comment: string) {
  const prefix = `${INDENT}# `;
  const lines: string[] = [];
  let line = prefix;
  for (const word of comment.split(' ')) {
    if (line !== prefix && line.length + 1 + word.length > WIDTH) {
      lines.push(line);
      line = prefix + word;
    } else {
      line = line === prefix ? line + word : `${line} ${word}`;
    }
  }
  return [...lines, line].map((l) => dim(l));
}

// Text for command.addHelpText('after', ...).
export function formatExamples(examples: HelpExample[]) {
  const blocks = examples.map((example) =>
    [
      ...wrapComment(example.comment),
      ...example.commands.flatMap(wrapCommand),
    ].join('\n')
  );
  return `\nExamples:\n${blocks.join('\n\n')}\n`;
}
