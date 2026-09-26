import { ensurePathExists } from '@lib';
import { info, success } from '@logger';
import { readFile, writeFile } from 'fs/promises';
import {
  ApiKeyCredentials,
  bearerToken,
  deleteCredentials,
  getCredentialsPath,
  isApiKeyCredentials,
  PendingSignup,
  readCredentials,
  readPendingSignup,
  StoredCredentials,
  writeCredentials,
  writePendingSignup,
} from './credentials';
import {
  authorize,
  canOpenBrowser,
  LOGIN_TIMEOUT_MS,
  OAuthLoginError,
  refresh,
  revoke,
} from './oauth';
import {
  CommandFailure,
  CommandResult,
  ExitCode,
  maskEmail,
  NextStep,
} from './result';
import {
  pollSignupRequest,
  resendSignupRequest,
  SignupRequestError,
  startSignupRequest,
} from './signupRequest';

export {
  bearerToken,
  getCredentialsPath,
  readCredentials,
} from './credentials';

const REFRESH_MARGIN_MS = 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const EXPIRY_WARNING_DAYS = 7;

const NEXT_LOGIN: NextStep = {
  command: 'currents login',
  why: 'Log in to an existing Currents account in the browser',
};
const NEXT_SIGNUP: NextStep = {
  command: 'currents signup --email <email>',
  why: 'Create a Currents account; the owner of the address confirms by email',
};
const NEXT_WHOAMI: NextStep = {
  command: 'currents whoami',
  why: 'See the organization, scopes and projects this login reaches',
};
const NEXT_SETUP: NextStep = {
  command: 'currents setup --project-name <name>',
  why: 'Create a project and write its id and record key to .env',
};
const NEXT_RESUME: NextStep = {
  command: 'currents signup --resume',
  why: 'Wait for the confirmation and store the API key',
};

const notLoggedIn = () =>
  new CommandFailure(
    'not_logged_in',
    'Not logged in.',
    ExitCode.notLoggedIn,
    undefined,
    [NEXT_SIGNUP, NEXT_LOGIN]
  );

/** The stored login with a current access token, or null when not logged in. */
export async function getValidCredentials(): Promise<StoredCredentials | null> {
  const credentials = await readCredentials();
  if (!credentials) {
    return null;
  }
  if (isApiKeyCredentials(credentials)) {
    return credentials;
  }
  if (credentials.expiresAt - Date.now() > REFRESH_MARGIN_MS) {
    return credentials;
  }
  try {
    const refreshed = await refresh(credentials);
    await writeCredentials(refreshed);
    return refreshed;
  } catch (e) {
    if (e instanceof OAuthLoginError) {
      throw new CommandFailure(
        'session_expired',
        e.message,
        ExitCode.notLoggedIn,
        undefined,
        [NEXT_LOGIN]
      );
    }
    throw e;
  }
}

async function requireCredentials() {
  const credentials = await getValidCredentials();
  if (!credentials) {
    throw notLoggedIn();
  }
  return credentials;
}

async function restApi<T>(
  credentials: StoredCredentials,
  path: string,
  init?: { method: string; body?: unknown }
): Promise<T> {
  const res = await fetch(`${credentials.apiUrl}${path}`, {
    method: init?.method ?? 'GET',
    headers: {
      Authorization: `Bearer ${bearerToken(credentials)}`,
      'Content-Type': 'application/json',
    },
    body: init?.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const body = await res.json().catch(() => null);
  if (res.status === 401) {
    throw new CommandFailure(
      'invalid_credentials',
      'The API does not accept the stored login: it was revoked or has expired.',
      ExitCode.notLoggedIn,
      undefined,
      [NEXT_LOGIN]
    );
  }
  if (!res.ok) {
    throw new Error(
      `${init?.method ?? 'GET'} ${path} answered HTTP ${res.status}: ${JSON.stringify(body)}`
    );
  }
  return body as T;
}

/** The stored login if it is for `apiUrl` and not about to expire. */
async function currentLoginFor(apiUrl: string) {
  const credentials = await readCredentials();
  if (!credentials || credentials.apiUrl !== apiUrl) {
    return null;
  }
  if (
    isApiKeyCredentials(credentials) &&
    credentials.expiresAt &&
    Date.parse(credentials.expiresAt) <= Date.now()
  ) {
    return null;
  }
  return credentials;
}

const alreadyLoggedIn = (
  credentials: StoredCredentials
): CommandResult<{ status: 'already_logged_in'; org_id: string | null }> => ({
  data: { status: 'already_logged_in', org_id: credentials.orgId ?? null },
  text: [
    `Already logged in to ${credentials.apiUrl}. Use --force to replace the login.`,
  ],
  nextSteps: [NEXT_WHOAMI],
});

export async function handleLogin({
  apiUrl,
  browser,
  timeoutSeconds,
  force,
  onProgress,
}: {
  apiUrl: string;
  browser: boolean;
  timeoutSeconds?: number;
  force?: boolean;
  onProgress: (line: string, fields: Record<string, unknown>) => void;
}) {
  const existing = !force && (await currentLoginFor(apiUrl));
  if (existing) {
    return alreadyLoggedIn(existing);
  }
  const openBrowser = browser && canOpenBrowser();
  let credentials;
  try {
    credentials = await authorize({
      apiUrl,
      signup: false,
      browser: openBrowser,
      timeoutMs: timeoutSeconds ? timeoutSeconds * 1000 : LOGIN_TIMEOUT_MS,
      onUrl: (url) =>
        onProgress(
          `${openBrowser ? 'Opened' : 'Open'} this link to log in to Currents:\n\n  ${url}\n\nWaiting for approval in the browser…`,
          { status: 'waiting', url }
        ),
    });
  } catch (e) {
    if (!(e instanceof OAuthLoginError)) {
      throw e;
    }
    throw new CommandFailure(
      e.code,
      e.message,
      e.code === 'timeout' ? ExitCode.waitingForPerson : ExitCode.notLoggedIn,
      undefined,
      [NEXT_LOGIN]
    );
  }
  await writeCredentials(credentials);
  return {
    data: {
      status: 'logged_in' as const,
      org_id: credentials.orgId ?? null,
      scopes: credentials.scope?.split(' ') ?? [],
      credentials_path: getCredentialsPath(),
    },
    text: [
      `Logged in to organization ${credentials.orgId ?? '(unknown)'}.`,
      `Credentials saved to ${getCredentialsPath()}`,
    ],
    nextSteps: [NEXT_WHOAMI],
  };
}

const waitingForConfirmation = (pending: PendingSignup) => ({
  data: {
    status: 'waiting' as const,
    email: maskEmail(pending.email),
    code: pending.code,
    expires_at: pending.expiresAt,
  },
  text: [
    `Still waiting for ${maskEmail(pending.email)} to confirm (code ${pending.code}).`,
  ],
  nextSteps: [NEXT_RESUME],
  exitCode: ExitCode.waitingForPerson,
});

function signupRequestFailure(e: SignupRequestError) {
  switch (e.code) {
    case 'email_not_allowed':
      return new CommandFailure(e.code, e.message, ExitCode.refused);
    case 'rate_limited':
      return new CommandFailure(
        e.code,
        e.message,
        ExitCode.refused,
        e.retryAfterSeconds
          ? `Try again in ${Math.ceil(e.retryAfterSeconds / 60)} min.`
          : 'Try again later.'
      );
    default:
      return new CommandFailure(e.code, e.message, ExitCode.unexpected);
  }
}

async function startSignup({
  apiUrl,
  email,
  clientName,
  orgName,
}: {
  apiUrl: string;
  email: string;
  clientName: string;
  orgName?: string;
}): Promise<PendingSignup> {
  const request = await startSignupRequest({
    apiUrl,
    email,
    clientName,
    orgName,
  });
  const pending: PendingSignup = {
    apiUrl,
    email,
    pollToken: request.poll_token,
    code: request.code,
    interval: request.interval,
    expiresAt: new Date(Date.now() + request.expires_in * 1000).toISOString(),
  };
  // Saved before anything is printed, so a killed process can be resumed.
  await writePendingSignup(pending);
  return pending;
}

async function requirePendingSignup() {
  const pending = await readPendingSignup();
  if (!pending) {
    throw new CommandFailure(
      'no_pending_signup',
      'There is no signup waiting for confirmation.',
      ExitCode.notLoggedIn,
      undefined,
      [NEXT_SIGNUP]
    );
  }
  return pending;
}

function signupEnded(status: 'expired' | 'consumed') {
  return status === 'consumed'
    ? new CommandFailure(
        'consumed',
        'The API key for this signup was already collected by another command, and it is not shown twice.',
        ExitCode.waitingForPerson,
        'Revoke it in the dashboard under Personal Access Tokens, then run "currents login".',
        [NEXT_LOGIN]
      )
    : new CommandFailure(
        'expired',
        'The signup request expired before the email was confirmed.',
        ExitCode.waitingForPerson,
        undefined,
        [NEXT_SIGNUP]
      );
}

async function collectSignup(pending: PendingSignup, timeoutSeconds?: number) {
  const remainingMs = Date.parse(pending.expiresAt) - Date.now();
  const outcome = await pollSignupRequest({
    apiUrl: pending.apiUrl,
    request: { poll_token: pending.pollToken, interval: pending.interval },
    timeoutMs: Math.min(
      remainingMs,
      timeoutSeconds === undefined ? Infinity : timeoutSeconds * 1000
    ),
  });

  switch (outcome.status) {
    case 'timeout':
      if (Date.parse(pending.expiresAt) > Date.now()) {
        return waitingForConfirmation(pending);
      }
      await writePendingSignup(null);
      throw signupEnded('expired');
    case 'expired':
    case 'consumed':
      await writePendingSignup(null);
      throw signupEnded(outcome.status);
    case 'existing_account':
      await writePendingSignup(null);
      throw new CommandFailure(
        'account_exists',
        `${maskEmail(pending.email)} already has a Currents account.`,
        ExitCode.accountExists,
        undefined,
        [NEXT_LOGIN]
      );
    case 'approved': {
      const credentials: ApiKeyCredentials = {
        kind: 'api-key',
        apiUrl: pending.apiUrl,
        apiKey: outcome.apiKey,
        apiKeyId: outcome.apiKeyId,
        expiresAt: outcome.apiKeyExpiresAt,
        orgId: outcome.orgId,
        orgName: outcome.orgName,
        createdAt: new Date().toISOString(),
      };
      await writeCredentials(credentials);
      await writePendingSignup(null);
      return {
        data: {
          status: 'approved' as const,
          org: { id: outcome.orgId, name: outcome.orgName },
          api_key_expires_at: outcome.apiKeyExpiresAt ?? null,
          credentials_path: getCredentialsPath(),
        },
        text: [
          `Account created. Organization: ${outcome.orgName} (${outcome.orgId})`,
          `Credentials saved to ${getCredentialsPath()}`,
        ],
        nextSteps: [NEXT_WHOAMI, NEXT_SETUP],
      };
    }
  }
}

export async function handleSignup({
  apiUrl,
  email,
  clientName,
  orgName,
  wait,
  resume,
  resend,
  timeoutSeconds,
  force,
  onProgress,
}: {
  apiUrl: string;
  email?: string;
  clientName: string;
  orgName?: string;
  wait: boolean;
  resume?: boolean;
  resend?: boolean;
  timeoutSeconds?: number;
  force?: boolean;
  onProgress: (line: string, fields: Record<string, unknown>) => void;
}): Promise<CommandResult<Record<string, unknown>>> {
  let pending: PendingSignup;
  try {
    if (resume || resend) {
      pending = await requirePendingSignup();
      if (resend) {
        const resent = await resendSignupRequest({
          apiUrl: pending.apiUrl,
          pollToken: pending.pollToken,
        });
        if (resent.status === 'expired' || resent.status === 'consumed') {
          await writePendingSignup(null);
          throw signupEnded(resent.status);
        }
        if (resent.status === 'sent') {
          onProgress(
            `Sent the email to ${maskEmail(pending.email)} again. The earlier link no longer works.`,
            { status: 'resent' }
          );
        }
      }
    } else {
      if (!email) {
        throw new CommandFailure(
          'invalid_arguments',
          'Pass --email, or --resume to continue a signup.',
          ExitCode.unexpected
        );
      }
      const existing = !force && (await currentLoginFor(apiUrl));
      if (existing) {
        return alreadyLoggedIn(existing);
      }
      pending = await startSignup({ apiUrl, email, clientName, orgName });
    }
  } catch (e) {
    throw e instanceof SignupRequestError ? signupRequestFailure(e) : e;
  }

  if (!wait) {
    return {
      ...waitingForConfirmation(pending),
      text: [
        `Sent a confirmation email to ${maskEmail(pending.email)}.`,
        `Ask its owner to click Confirm and check the code matches: ${pending.code}`,
      ],
    };
  }

  const started = !resume && !resend;
  onProgress(
    `${
      started
        ? `Sent a confirmation email to ${maskEmail(pending.email)}.\nAsk its owner to click Confirm and check the code matches: ${pending.code}`
        : `Waiting for ${maskEmail(pending.email)} to confirm (code ${pending.code}).`
    }\nWaiting… (expires ${new Date(pending.expiresAt).toLocaleTimeString()})`,
    {
      status: 'waiting',
      email: maskEmail(pending.email),
      code: pending.code,
      expires_at: pending.expiresAt,
    }
  );
  return collectSignup(pending, timeoutSeconds);
}

type LogoutData = {
  status: 'logged_out' | 'not_logged_in';
  revoked: boolean;
};

export async function handleLogout({
  keepRemote,
}: {
  keepRemote?: boolean;
}): Promise<CommandResult<LogoutData>> {
  const credentials = await readCredentials();
  const hadPendingSignup = Boolean(await readPendingSignup());
  await writePendingSignup(null);
  if (!credentials) {
    return {
      data: { status: 'not_logged_in', revoked: false },
      text: [
        hadPendingSignup
          ? 'Not logged in. Discarded the signup waiting for confirmation.'
          : 'Not logged in.',
      ],
    };
  }

  let revoked = false;
  let revokeError: string | undefined;
  if (!keepRemote) {
    try {
      if (isApiKeyCredentials(credentials)) {
        await restApi(credentials, '/v1/me/credential', { method: 'DELETE' });
      } else {
        await revoke(credentials);
      }
      revoked = true;
    } catch (e) {
      // A key the API already refuses cannot be used by anyone.
      revoked = e instanceof CommandFailure && e.code === 'invalid_credentials';
      revokeError = revoked ? undefined : (e as Error).message;
    }
  }
  await deleteCredentials();

  const text = ['Logged out.'];
  if (!revoked) {
    text.push(
      isApiKeyCredentials(credentials)
        ? 'The API key still works until it is revoked in the dashboard, under Personal Access Tokens.'
        : 'The login was not revoked on the server; it expires on its own.'
    );
  }
  if (revokeError) {
    text.push(`Revoking failed: ${revokeError}`);
  }
  return { data: { status: 'logged_out', revoked }, text };
}

type Me = {
  org: { id: string; name: string | null };
  user: { id: string; email: string; role: string } | null;
  credential: {
    kind: 'personal_access_token' | 'oauth_access_token' | 'api_key';
    id: string | null;
    scopes: string[];
    expires_at: string | null;
  };
};

type Project = { projectId: string; name: string };

export async function handleWhoami() {
  const credentials = await requireCredentials();
  const { data: me } = await restApi<{ data: Me }>(credentials, '/v1/me');
  const projects = me.credential.scopes.includes('projects:read')
    ? await restApi<{ data: Project[]; has_more?: boolean }>(
        credentials,
        '/v1/projects?limit=5'
      )
    : null;

  const expiresAt = me.credential.expires_at;
  const expiresInDays = expiresAt
    ? Math.floor((Date.parse(expiresAt) - Date.now()) / DAY_MS)
    : null;
  const expiringSoon =
    expiresInDays !== null && expiresInDays < EXPIRY_WARNING_DAYS;

  const nextSteps: NextStep[] = [];
  if (expiringSoon) {
    nextSteps.push({
      ...NEXT_LOGIN,
      why: `This login expires in ${expiresInDays} days; log in to get a new one`,
    });
  }
  if (projects && !projects.data.length) {
    nextSteps.push(NEXT_SETUP);
  }

  const text = [
    `API:          ${credentials.apiUrl}`,
    `Organization: ${me.org.name ?? '(unknown)'} (${me.org.id})`,
    `User:         ${me.user?.email ?? '(organization API key)'}`,
    `Credential:   ${me.credential.kind}`,
    `Scopes:       ${me.credential.scopes.join(' ')}`,
  ];
  if (expiresAt) {
    text.push(
      `Expires:      ${expiresAt} (${expiresInDays} days)${expiringSoon ? ' — soon' : ''}`
    );
  }
  if (projects) {
    text.push(`Projects:     ${projects.data.length ? '' : '(none)'}`);
    for (const project of projects.data) {
      text.push(`  ${project.projectId}  ${project.name}`);
    }
    if (projects.has_more) {
      text.push('  …');
    }
  }

  return {
    data: {
      api_url: credentials.apiUrl,
      org: me.org,
      user: me.user,
      credential: me.credential,
      expires_in_days: expiresInDays,
      projects: projects
        ? {
            sample: projects.data.map((p) => ({
              id: p.projectId,
              name: p.name,
            })),
            has_more: Boolean(projects.has_more),
          }
        : null,
    },
    text,
    nextSteps,
  };
}

/** Sets or replaces `KEY=value` lines, keeping every other line as it was. */
function mergeEnv(content: string, values: Record<string, string>) {
  const lines = content ? content.split('\n') : [];
  for (const [key, value] of Object.entries(values)) {
    const line = `${key}=${value}`;
    const index = lines.findIndex((l) => l.startsWith(`${key}=`));
    if (index === -1) {
      if (lines.length && lines[lines.length - 1] === '') {
        lines.splice(lines.length - 1, 0, line);
      } else {
        lines.push(line);
      }
    } else {
      lines[index] = line;
    }
  }
  const merged = lines.join('\n');
  return merged.endsWith('\n') ? merged : `${merged}\n`;
}

export async function handleSetup({
  projectName,
  envFile,
}: {
  projectName: string;
  envFile: string;
}) {
  const credentials = await requireCredentials();
  const { data } = await restApi<{
    data: { projectId: string; name: string; recordKey: string };
  }>(credentials, '/v1/projects', {
    method: 'POST',
    body: { name: projectName },
  });

  await ensurePathExists(envFile);
  const existing = await readFile(envFile, 'utf-8').catch(() => '');
  await writeFile(
    envFile,
    mergeEnv(existing, {
      CURRENTS_PROJECT_ID: data.projectId,
      CURRENTS_RECORD_KEY: data.recordKey,
    })
  );
  success(`Created project "${data.name}" (${data.projectId})`);
  info(`Wrote CURRENTS_PROJECT_ID and CURRENTS_RECORD_KEY to ${envFile}`);
}
