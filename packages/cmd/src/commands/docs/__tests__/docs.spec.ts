import fs from 'fs-extra';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getDocsCommand } from '../index';
import { getDocsFolder, parseTopic } from '../docs';

const docsFolder = path.resolve(__dirname, '../../../../docs');
const topicFiles = fs
  .readdirSync(docsFolder)
  .filter((file) => file.endsWith('.md'));

describe('docs command', () => {
  let stdout: string;
  let stderr: string;

  beforeEach(() => {
    stdout = '';
    stderr = '';
    vi.spyOn(process.stdout, 'write').mockImplementation(((
      chunk: string,
      callback?: () => void
    ) => {
      stdout += String(chunk);
      callback?.();
      return true;
    }) as never);
    vi.spyOn(console, 'error').mockImplementation((...args) => {
      stderr += args.join(' ') + '\n';
    });
    vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const run = (args: string[]) =>
    getDocsCommand('currents').parseAsync(args, { from: 'user' });

  it('finds docs/ of the package when run from the source', () => {
    expect(getDocsFolder()).toBe(docsFolder);
  });

  it('lists every file in docs/ with its description', async () => {
    await run([]);

    expect(topicFiles.length).toBeGreaterThan(0);
    for (const file of topicFiles) {
      const name = path.basename(file, '.md');
      const { description } = parseTopic(
        name,
        await fs.readFile(path.join(docsFolder, file), 'utf8')
      );
      const line = stdout.split('\n').find((l) => l.startsWith(`  ${name} `));
      expect(line?.endsWith(` ${description}`)).toBe(true);
    }
    expect(stdout).toContain("Run 'currents docs <topic>' to print a guide.");
    expect(process.exit).toHaveBeenCalledWith(0);
  });

  it('prints a guide without its front matter', async () => {
    await run(['sessions']);

    const markdown = await fs.readFile(
      path.join(docsFolder, 'sessions.md'),
      'utf8'
    );
    expect(stdout).toBe(markdown.slice(markdown.indexOf('# Sessions')));
    expect(process.exit).toHaveBeenCalledWith(0);
  });

  it('fails on an unknown topic and lists the topics', async () => {
    await run(['nope']);

    expect(stderr).toContain('Unknown topic "nope". Topics:');
    expect(stderr).toMatch(/^ {2}ci-setup +\S/m);
    expect(stdout).toBe('');
    expect(process.exit).toHaveBeenCalledWith(1);
  });

  it('reads a guide with CRLF line endings', () => {
    expect(
      parseTopic('x', '---\r\ndescription: A guide\r\n---\r\n\r\n# X\r\n')
    ).toEqual({ name: 'x', description: 'A guide', body: '# X\r\n' });
  });

  it('refuses a guide without a description', () => {
    expect(() => parseTopic('x', '# X\n')).toThrow(
      'docs/x.md has no description in its front matter'
    );
  });
});
