import { pathExists, readJson } from '@lib/fs';
import fs from 'fs/promises';
import path from 'path';

export type SessionState = {
  sessionId: string;
  /** Absent in a file saved before sessions had their own ID. */
  projectId?: string;
};

/**
 * Not `.currents`: that folder belongs to the reporters, and
 * `currents run upload` reads the newest folder in it as its report.
 */
export const SESSION_FOLDER = '.currents-session';

export const getSessionStatePath = () =>
  path.join(process.cwd(), SESSION_FOLDER, 'session.json');

/**
 * Keeps the folder out of commits with a `.gitignore` inside it, so no file of
 * the project is touched.
 */
async function ignoreSessionFolder(folder: string) {
  const file = path.join(folder, '.gitignore');
  if (!(await pathExists(file))) await fs.writeFile(file, '*\n');
}

export async function saveSessionState(state: SessionState) {
  const file = getSessionStatePath();
  await fs.mkdir(path.dirname(file), { recursive: true });
  await ignoreSessionFolder(path.dirname(file));
  await fs.writeFile(file, JSON.stringify(state, null, 2) + '\n');
}

export async function readSessionState(): Promise<SessionState | null> {
  const file = getSessionStatePath();
  if (!(await pathExists(file))) return null;
  const saved = await readJson(file);
  // A session saved before sessions had their own ID kept its run ID, and that
  // run ID is the session ID.
  const sessionId = saved?.sessionId || saved?.runId;
  if (typeof sessionId !== 'string' || !sessionId.trim()) return null;
  const projectId =
    typeof saved.projectId === 'string' ? saved.projectId : undefined;
  return { sessionId, projectId };
}

/**
 * `--session-id` wins. Otherwise the session saved by `currents session start`.
 */
export async function resolveSessionId(sessionId?: string) {
  if (sessionId) return sessionId;
  const state = await readSessionState();
  if (!state) {
    throw new Error(
      'No session found. Run "currents session start" first, or pass --session-id'
    );
  }
  return state.sessionId;
}
