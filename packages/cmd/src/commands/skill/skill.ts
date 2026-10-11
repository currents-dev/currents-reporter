import { findUp } from '@lib/fs';
import { info } from '@logger';
import fs from 'fs-extra';
import path from 'path';
import { writeStdout } from '../utils';

export const SKILL_NAME = 'currents-cli';
export const DEFAULT_SKILLS_DIR = path.join('.agents', 'skills');

/**
 * The build copies the skill from skills/ at the repository root to
 * dist/skills/. Searching up from this file finds dist/skills in the package
 * and the repository copy when the code runs from src/ in tests.
 */
export function getSkillFolder(from = __dirname) {
  const skill = path.join('skills', SKILL_NAME);
  const dir = findUp(path.join(skill, 'SKILL.md'), from);
  if (!dir) {
    throw new Error(`The ${SKILL_NAME} skill is missing from this package`);
  }
  return path.join(dir, skill);
}

async function listFiles(folder: string, prefix = ''): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await fs.readdir(path.join(folder, prefix), {
    withFileTypes: true,
  })) {
    const name = path.join(prefix, entry.name);
    if (entry.isDirectory()) files.push(...(await listFiles(folder, name)));
    else files.push(name);
  }
  return files.sort();
}

async function haveSameFiles(a: string, b: string) {
  const [filesA, filesB] = await Promise.all([listFiles(a), listFiles(b)]);
  if (filesA.join('\n') !== filesB.join('\n')) return false;
  for (const file of filesA) {
    const [contentA, contentB] = await Promise.all([
      fs.readFile(path.join(a, file)),
      fs.readFile(path.join(b, file)),
    ]);
    if (!contentA.equals(contentB)) return false;
  }
  return true;
}

export async function printSkill() {
  await writeStdout(
    await fs.readFile(path.join(getSkillFolder(), 'SKILL.md'), 'utf8')
  );
}

export async function installSkill({
  dir = DEFAULT_SKILLS_DIR,
  force = false,
}: {
  dir?: string;
  force?: boolean;
}) {
  const source = getSkillFolder();
  const target = path.resolve(dir, SKILL_NAME);
  const shownTarget = path.relative(process.cwd(), target) || '.';

  if (await fs.pathExists(target)) {
    if (!(await fs.stat(target)).isDirectory()) {
      throw new Error(`${shownTarget} exists and is not a folder`);
    }
    if (await haveSameFiles(source, target)) {
      info('The %s skill is already in %s', SKILL_NAME, shownTarget);
      return target;
    }
    if (!force) {
      throw new Error(
        `${shownTarget} exists and differs from the skill of this version. Pass --force to replace it`
      );
    }
    await fs.remove(target);
  }

  await fs.copy(source, target);
  info('Wrote the %s skill to %s', SKILL_NAME, shownTarget);
  return target;
}
