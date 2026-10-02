import { info } from '@logger';
import fs from 'fs-extra';
import path from 'path';

export const SKILL_NAME = 'currents-cli';
export const DEFAULT_SKILLS_DIR = path.join('.agents', 'skills');

/**
 * The build copies the skill from skills/ at the repository root to
 * dist/skills/. Searching up from this file finds dist/skills in the package
 * and the repository copy when the code runs from src/ in tests.
 */
export function getSkillFolder(from = __dirname) {
  let dir = from;
  while (true) {
    const folder = path.join(dir, 'skills', SKILL_NAME);
    if (fs.existsSync(path.join(folder, 'SKILL.md'))) return folder;
    const parent = path.dirname(dir);
    if (parent === dir) {
      throw new Error(`The ${SKILL_NAME} skill is missing from this package`);
    }
    dir = parent;
  }
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
  const content = await fs.readFile(
    path.join(getSkillFolder(), 'SKILL.md'),
    'utf8'
  );
  // commandHandler calls process.exit, which can cut off a write to a pipe
  // that has not finished.
  await new Promise<void>((resolve, reject) =>
    process.stdout.write(content, (e) => (e ? reject(e) : resolve()))
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
