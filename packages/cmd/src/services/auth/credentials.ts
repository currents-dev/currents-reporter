import { chmod, mkdir, readFile, rm, writeFile } from 'fs/promises';
import os from 'os';
import path from 'path';

/** From `currents login`. */
export type OAuthCredentials = {
  kind?: 'oauth';
  apiUrl: string;
  accessToken: string;
  refreshToken?: string;
  /** Epoch milliseconds. */
  expiresAt: number;
  scope?: string;
  orgId?: string;
};

/** From `currents signup`: a personal access token. */
export type ApiKeyCredentials = {
  kind: 'api-key';
  apiUrl: string;
  apiKey: string;
  /** Id of the personal access token. */
  apiKeyId?: string;
  /** ISO date. */
  expiresAt?: string;
  orgId: string;
  orgName: string;
  /** ISO date. */
  createdAt: string;
};

export type StoredCredentials = OAuthCredentials | ApiKeyCredentials;

/**
 * A signup waiting for the email to be confirmed, kept so `signup --resume`
 * can collect the key after the command that started it has exited.
 */
export type PendingSignup = {
  apiUrl: string;
  email: string;
  pollToken: string;
  code: string;
  /** Seconds between polls. */
  interval: number;
  /** ISO date. */
  expiresAt: string;
};

type AuthFile = {
  login?: StoredCredentials;
  pendingSignup?: PendingSignup;
};

export const isApiKeyCredentials = (
  credentials: StoredCredentials
): credentials is ApiKeyCredentials => credentials.kind === 'api-key';

/** What goes in `Authorization: Bearer` for REST API calls. */
export const bearerToken = (credentials: StoredCredentials) =>
  isApiKeyCredentials(credentials)
    ? credentials.apiKey
    : credentials.accessToken;

export const getCredentialsPath = () =>
  path.join(
    process.env.CURRENTS_CONFIG_DIR ??
      path.join(os.homedir(), '.config', 'currents'),
    'credentials.json'
  );

async function readAuthFile(): Promise<AuthFile> {
  try {
    return JSON.parse(await readFile(getCredentialsPath(), 'utf-8'));
  } catch {
    return {};
  }
}

/** Deletes the file once nothing is left in it. */
async function writeAuthFile(content: AuthFile) {
  const file = getCredentialsPath();
  if (!content.login && !content.pendingSignup) {
    await rm(file, { force: true });
    return;
  }
  await mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  await writeFile(file, JSON.stringify(content, null, 2), { mode: 0o600 });
  // `mode` applies only when the file is created.
  await chmod(file, 0o600);
}

export async function readCredentials(): Promise<StoredCredentials | null> {
  return (await readAuthFile()).login ?? null;
}

export async function writeCredentials(login: StoredCredentials) {
  await writeAuthFile({ ...(await readAuthFile()), login });
}

export async function deleteCredentials() {
  const { pendingSignup } = await readAuthFile();
  await writeAuthFile({ pendingSignup });
}

export async function readPendingSignup(): Promise<PendingSignup | null> {
  return (await readAuthFile()).pendingSignup ?? null;
}

export async function writePendingSignup(pendingSignup: PendingSignup | null) {
  const { login } = await readAuthFile();
  await writeAuthFile({ login, pendingSignup: pendingSignup ?? undefined });
}
