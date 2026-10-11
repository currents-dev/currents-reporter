import { findUp } from '@lib/fs';
import fs from 'fs-extra';
import path from 'path';
import { writeStdout } from '../utils';

export type Topic = { name: string; description: string; body: string };

// The guides are in docs/ next to package.json, both in the published package
// and in the repository.
export function getDocsFolder(from = __dirname) {
  const dir = findUp('package.json', from);
  if (!dir) throw new Error('The docs folder is missing from this package');
  return path.join(dir, 'docs');
}

// A guide starts with a front matter block that has a "description:" line,
// like SKILL.md.
export function parseTopic(name: string, markdown: string): Topic {
  const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n)+/);
  const description = match?.[1].match(/^description:[ \t]*(.+?)\r?$/m)?.[1];
  if (!match || !description) {
    throw new Error(`docs/${name}.md has no description in its front matter`);
  }
  return { name, description, body: markdown.slice(match[0].length) };
}

export async function getTopics(folder = getDocsFolder()) {
  const files = (await fs.readdir(folder))
    .filter((file) => file.endsWith('.md'))
    .sort();
  return Promise.all(
    files.map(async (file) =>
      parseTopic(
        path.basename(file, '.md'),
        await fs.readFile(path.join(folder, file), 'utf8')
      )
    )
  );
}

export function formatTopics(topics: Topic[]) {
  const width = Math.max(...topics.map((t) => t.name.length));
  return topics
    .map((t) => `  ${t.name.padEnd(width)}  ${t.description}\n`)
    .join('');
}

export async function printDocs(name: string, topicName?: string) {
  const topics = await getTopics();
  if (!topicName) {
    await writeStdout(
      `Topics:\n${formatTopics(topics)}\nRun '${name} docs <topic>' to print a guide.\n`
    );
    return;
  }
  const topic = topics.find((t) => t.name === topicName);
  if (!topic) {
    throw new Error(
      `Unknown topic "${topicName}". Topics:\n${formatTopics(topics)}`
    );
  }
  await writeStdout(topic.body);
}
