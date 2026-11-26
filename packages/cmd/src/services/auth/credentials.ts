import { randomBytes } from 'crypto';
import { chmod, mkdir, readFile, rename, rm, writeFile } from 'fs/promises';
import os from 'os';
import path from 'path';

/** The tokens of `currents login`. */
export type OAuthCredentials = {
  /** The REST API the tokens are for. */
  apiUrl: string;
  accessToken: string;
  refreshToken?: string;
  /** Epoch milliseconds. */
  expiresAt: number;
  scope?: string;
};

type CredentialsFile = { login?: OAuthCredentials };

/** The XDG Base Directory spec ignores a relative XDG_CONFIG_HOME. */
const getConfigHome = () => {
  const xdg = process.env.XDG_CONFIG_HOME;
  return xdg && path.isAbsolute(xdg) ? xdg : path.join(os.homedir(), '.config');
};

export const getCredentialsPath = () =>
  path.join(
    process.env.CURRENTS_CONFIG_DIR ?? path.join(getConfigHome(), 'currents'),
    'credentials.json'
  );

export async function readCredentials(): Promise<OAuthCredentials | null> {
  try {
    const file: CredentialsFile = JSON.parse(
      await readFile(getCredentialsPath(), 'utf-8')
    );
    return file.login ?? null;
  } catch {
    return null;
  }
}

/**
 * Written to a temporary file and renamed over the old one, so a command
 * reading the file at the same time sees the old login or the new one, never
 * part of either.
 */
export async function writeCredentials(login: OAuthCredentials) {
  const file = getCredentialsPath();
  const dir = path.dirname(file);
  await mkdir(dir, { recursive: true, mode: 0o700 });
  // `mode` applies only to the directories `mkdir` creates.
  await chmod(dir, 0o700);
  const content: CredentialsFile = { login };
  const tmp = `${file}.${randomBytes(6).toString('hex')}.tmp`;
  try {
    await writeFile(tmp, JSON.stringify(content, null, 2), {
      mode: 0o600,
      flag: 'wx',
    });
    await rename(tmp, file);
  } catch (e) {
    await rm(tmp, { force: true });
    throw e;
  }
}

export async function deleteCredentials() {
  await rm(getCredentialsPath(), { force: true });
}
