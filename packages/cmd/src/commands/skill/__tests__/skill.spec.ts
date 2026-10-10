import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getSkillCommand } from '../index';
import { getSkillFolder } from '../skill';

const skillFolder = path.resolve(
  __dirname,
  '../../../../../../skills/currents-cli'
);

describe('skill command', () => {
  let dir: string;
  let cwd: string;
  let stdout: string;
  let stderr: string;

  beforeEach(async () => {
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
    vi.spyOn(console, 'log').mockImplementation((...args) => {
      stdout += args.join(' ') + '\n';
    });
    vi.spyOn(console, 'error').mockImplementation((...args) => {
      stderr += args.join(' ') + '\n';
    });
    vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'skill-'));
    cwd = process.cwd();
    process.chdir(dir);
  });

  afterEach(async () => {
    process.chdir(cwd);
    vi.restoreAllMocks();
    await fs.remove(dir);
  });

  const run = (args: string[]) =>
    getSkillCommand('currents').parseAsync(args, { from: 'user' });

  it('finds the skill at the repository root when run from the source', () => {
    expect(getSkillFolder()).toBe(skillFolder);
  });

  it('prints SKILL.md', async () => {
    await run([]);

    expect(stdout).toBe(
      await fs.readFile(path.join(skillFolder, 'SKILL.md'), 'utf8')
    );
    expect(process.exit).toHaveBeenCalledWith(0);
  });

  it('writes the skill folder to .agents/skills/currents-cli', async () => {
    await run(['--install']);

    const target = path.join(dir, '.agents/skills/currents-cli');
    expect(await fs.readdir(target)).toEqual(['SKILL.md']);
    expect(await fs.readFile(path.join(target, 'SKILL.md'), 'utf8')).toBe(
      await fs.readFile(path.join(skillFolder, 'SKILL.md'), 'utf8')
    );
    expect(stdout).toContain(
      'Wrote the currents-cli skill to .agents/skills/currents-cli'
    );
    expect(process.exit).toHaveBeenCalledWith(0);
  });

  it('writes the skill folder to --dir', async () => {
    await run(['--install', '--dir', '.claude/skills']);

    expect(
      await fs.pathExists(
        path.join(dir, '.claude/skills/currents-cli/SKILL.md')
      )
    ).toBe(true);
  });

  it('leaves an identical installed copy as it is', async () => {
    await run(['--install']);
    await run(['--install']);

    expect(stdout).toContain(
      'The currents-cli skill is already in .agents/skills/currents-cli'
    );
    expect(process.exit).toHaveBeenLastCalledWith(0);
  });

  it('refuses to overwrite a folder that differs, and --force replaces it', async () => {
    const target = path.join(dir, '.agents/skills/currents-cli');
    await fs.outputFile(path.join(target, 'SKILL.md'), 'edited by hand');
    await fs.outputFile(path.join(target, 'notes.md'), 'mine');

    await run(['--install']);

    expect(stderr).toContain(
      '.agents/skills/currents-cli exists and differs from the skill of this version. Pass --force to replace it'
    );
    expect(process.exit).toHaveBeenLastCalledWith(1);
    expect(await fs.readFile(path.join(target, 'SKILL.md'), 'utf8')).toBe(
      'edited by hand'
    );

    await run(['--install', '--force']);

    expect(process.exit).toHaveBeenLastCalledWith(0);
    expect(await fs.readFile(path.join(target, 'SKILL.md'), 'utf8')).toBe(
      await fs.readFile(path.join(skillFolder, 'SKILL.md'), 'utf8')
    );
    expect(await fs.pathExists(path.join(target, 'notes.md'))).toBe(false);
  });

  it('fails when --force is given without --install', async () => {
    await run(['--force']);

    expect(stderr).toContain('--dir and --force work with --install only');
    expect(process.exit).toHaveBeenLastCalledWith(1);
  });
});
