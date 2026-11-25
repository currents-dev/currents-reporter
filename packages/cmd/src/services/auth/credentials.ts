import { chmod, mkdir, readFile, rm, writeFile } from 'fs/promises';
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

export const getCredentialsPath = () =>
  path.join(
    process.env.CURRENTS_CONFIG_DIR ??
      path.join(os.homedir(), '.config', 'currents'),
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

export async function writeCredentials(login: OAuthCredentials) {
  const file = getCredentialsPath();
  await mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  const content: CredentialsFile = { login };
  await writeFile(file, JSON.stringify(content, null, 2), { mode: 0o600 });
  // `mode` applies only when the file is created.
  await chmod(file, 0o600);
}

export async function deleteCredentials() {
  await rm(getCredentialsPath(), { force: true });
}
