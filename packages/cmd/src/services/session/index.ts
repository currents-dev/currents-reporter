import { getCI } from '@env/ciProvider';
import { getGitInfo } from '@env/gitInfo';
import { debug as _debug } from '@debug';
import { info } from '@logger';
import { createSession, createShare } from '../../api';
import {
  RunAttachConfig,
  SessionAttachConfig,
  SessionShareConfig,
  SessionStartConfig,
} from '../../config/session';
import { attachFiles } from '../files/attach';
import { resolveSessionId, saveSessionState } from './state';

const debug = _debug.extend('session');

async function getCommit() {
  try {
    const { sha, branch, message, authorName, authorEmail, remoteOrigin } =
      await getGitInfo();
    return { sha, branch, message, authorName, authorEmail, remoteOrigin };
  } catch (e) {
    // A session can run outside a repository.
    debug('No git info: %o', e);
    return undefined;
  }
}

/**
 * A link goes as it is; a bare number is resolved on the server with the
 * commit's remote.
 */
export function parsePr(pr?: string) {
  if (!pr) return undefined;
  return /^\d+$/.test(pr) ? { id: pr } : { link: pr };
}

/**
 * The CI data the reporters send. It has no ciBuildId: the session route
 * makes its own, and `run attach` leaves the API to derive it.
 */
function getCIParams() {
  const { provider, params } = getCI();
  return { provider, params };
}

/**
 * Without --ci-build-id the API derives the build ID from the CI environment,
 * which only works on a provider whose build ID the reporters detect.
 */
function assertCIBuildIdDetectable() {
  if (getCI().ciBuildId.source === 'server') return;
  throw new Error(
    'The CI build ID is unknown. Pass --ci-build-id or set CURRENTS_CI_BUILD_ID to the value the run was recorded with'
  );
}

export async function handleSessionStart(config: SessionStartConfig) {
  const session = await createSession(config.apiKey, {
    projectId: config.projectId,
    title: config.title,
    status: config.status,
    error: config.error,
    tags: config.tag,
    commit: await getCommit(),
    ci: getCIParams(),
    pr: parsePr(config.pr),
  });

  await saveSessionState({
    sessionId: session.sessionId,
    projectId: config.projectId,
  });

  if (config.json) {
    process.stdout.write(
      JSON.stringify({ sessionId: session.sessionId }) + '\n'
    );
  } else {
    info('Session started: %s', session.sessionId);
  }
  return session;
}

export async function handleSessionAttach(
  config: SessionAttachConfig,
  paths: string[]
) {
  const sessionId = await resolveSessionId(config.sessionId);
  return attachFiles({
    credentials: { apiKey: config.apiKey },
    owner: { sessionId },
    paths,
    type: config.type,
    caption: config.caption,
    meta: config.meta,
  });
}

export async function handleSessionShare(config: SessionShareConfig) {
  const sessionId = await resolveSessionId(config.sessionId);
  const share = await createShare(config.apiKey, {
    sessionId,
    purpose: 'report',
    expiresInDays: config.expiresInDays as 1 | 3 | 7 | undefined,
  });
  info(share.pageUrl);
  // A person opens the page; an agent reads the markdown.
  info('Markdown: %s', share.url);
  return share;
}

export async function handleRunAttach(
  config: RunAttachConfig,
  paths: string[]
) {
  if (!config.spec && !config.testTitle && !config.machineId) {
    throw new Error(
      'Files for the whole run are listed by machine: pass --machine-id, or --spec to attach to a spec file'
    );
  }
  if (!config.ciBuildId) assertCIBuildIdDetectable();
  return attachFiles({
    credentials: { apiKey: config.apiKey, recordKey: config.recordKey },
    owner: config.ciBuildId
      ? { projectId: config.projectId, ciBuildId: config.ciBuildId }
      : { projectId: config.projectId, ci: getCIParams() },
    target: {
      spec: config.spec,
      testTitle: config.testTitle,
      groupId: config.group,
      attempt: config.attempt,
      // The API takes a machine ID for run-level files only.
      machineId: config.spec || config.testTitle ? undefined : config.machineId,
    },
    paths,
    type: config.type,
    caption: config.caption,
    meta: config.meta,
  });
}
