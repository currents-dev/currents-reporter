import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { handleLogin } from '..';
import {
  OAuthCredentials,
  readCredentials,
  writeCredentials,
} from '../credentials';
import { authorize, revoke } from '../oauth';

vi.mock('../oauth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../oauth')>()),
  authorize: vi.fn(),
  revoke: vi.fn(),
}));

const credentials = (accessToken: string): OAuthCredentials => ({
  apiUrl: 'https://api.example.test',
  accessToken,
  refreshToken: `${accessToken}-rt`,
  expiresAt: Date.now() + 3600_000,
});

let configDir: string;

beforeEach(async () => {
  configDir = await fs.mkdtemp(path.join(os.tmpdir(), 'currents-login-'));
  vi.stubEnv('CURRENTS_CONFIG_DIR', configDir);
  vi.stubEnv('CURRENTS_REST_API_URL', 'https://api.example.test');
  vi.mocked(authorize).mockResolvedValue(credentials('new'));
  vi.mocked(revoke).mockResolvedValue(true);
});

afterEach(async () => {
  vi.unstubAllEnvs();
  vi.resetAllMocks();
  await fs.remove(configDir);
});

it('revokes the login it replaces, after saving the new one', async () => {
  await writeCredentials(credentials('old'));

  await handleLogin({ browser: false });

  expect(revoke).toHaveBeenCalledWith(
    expect.objectContaining({ refreshToken: 'old-rt' })
  );
  expect(await readCredentials()).toMatchObject({ accessToken: 'new' });
});

it('keeps the new login when the old one cannot be revoked', async () => {
  await writeCredentials(credentials('old'));
  vi.mocked(revoke).mockRejectedValue(new Error('offline'));

  await handleLogin({ browser: false });

  expect(await readCredentials()).toMatchObject({ accessToken: 'new' });
});

it('revokes nothing on a first login', async () => {
  await handleLogin({ browser: false });

  expect(revoke).not.toHaveBeenCalled();
});
