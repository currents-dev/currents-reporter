import { AxiosResponse, isAxiosError } from 'axios';
import { debug as _debug } from '../debug';
import { ClientType, getClient } from '../http/client';
import { getRetryAfterMs } from '../http/httpRetry';
import type { Commit } from '../env/gitInfo';
import type { FileType } from '../services/files/types';

const debug = _debug.extend('api');

export type ApiCredentials = { apiKey?: string; recordKey?: string };

/**
 * A record key goes in `x-currents-key`, and only the files routes accept it.
 * It wins when both are set, as in `currents upload`.
 */
export function getAuthHeaders({ apiKey, recordKey }: ApiCredentials) {
  if (recordKey) return { 'x-currents-key': recordKey };
  if (apiKey) return { Authorization: `Bearer ${apiKey}` };
  return {};
}

type ApiResponse<T> = { status: 'OK'; data: T };

/**
 * The REST API answers errors with `{ status: 'FAILED', error, code? }`. The
 * text is what the user needs, for example "public sharing is turned off".
 */
export function toApiError(e: unknown) {
  if (!isAxiosError(e) || !e.response) return e;
  const data = e.response.data as {
    error?: string;
    code?: string;
    candidates?: unknown;
  };
  const parts = [`${e.response.status}`];
  if (data?.code) parts.push(data.code);
  const text = data?.error ?? e.message;
  const retryAfter = getRetryAfterMs(e);
  const wait = retryAfter
    ? ` Retry in ${Math.ceil(retryAfter / 1000)} seconds.`
    : '';
  const candidates = formatCandidates(data?.candidates);
  return new Error(`${parts.join(' ')}: ${text}${wait}${candidates}`);
}

type Candidate = {
  runId?: string;
  ciBuildId?: string;
  instanceId?: string;
  testId?: string;
  spec?: string;
  title?: string;
};

function formatCandidates(candidates: unknown) {
  if (!Array.isArray(candidates) || candidates.length === 0) return '';
  const lines = (candidates as Candidate[]).map(
    ({ spec, title, instanceId, testId, runId, ciBuildId }) =>
      runId
        ? `  - run ${runId} (CI build ID ${ciBuildId})`
        : `  - ${[spec, title].filter(Boolean).join(' > ')} (instance ${instanceId}${testId ? `, test ${testId}` : ''})`
  );
  return `\nMatches:\n${lines.join('\n')}`;
}

async function post<T, D>(url: string, credentials: ApiCredentials, data: D) {
  try {
    // Not makeRequest: it prints a generic warning for each failed status, and
    // toApiError turns the API's own message into the error.
    const res = await getClient(ClientType.REST_API).post<
      ApiResponse<T>,
      AxiosResponse<ApiResponse<T>>,
      D
    >(url, data, { headers: getAuthHeaders(credentials) });
    return res.data.data;
  } catch (e) {
    throw toApiError(e);
  }
}

export type AttachmentDeclaration = {
  name: string;
  type: FileType;
  contentType: string;
  sizeBytes: number;
  caption?: string;
  meta?: Record<string, string>;
};

export type CreateSessionParams = {
  projectId: string;
  title: string;
  status: 'passed' | 'failed';
  error?: string;
  tags?: string[];
  commit?: Partial<Commit>;
  ci?: { provider: string | null; params: unknown };
  pr?: { link?: string; id?: string };
};

export type CreateSessionResponse = {
  sessionId: string;
};

export function createSession(apiKey: string, params: CreateSessionParams) {
  debug('Create session params: %o', params);
  return post<CreateSessionResponse, CreateSessionParams>(
    'v1/sessions',
    { apiKey },
    params
  );
}

/** Where an attachment goes on a CI run. A session has no target. */
export type RunAttachmentTarget = {
  instanceId?: string;
  testId?: string;
  attempt?: number;
  spec?: string;
  testTitle?: string;
  groupId?: string;
  machineId?: string;
};

/**
 * A session, or a CI run found by its id, or by `projectId` with its
 * `ciBuildId` or the CI environment the build ID is derived from - the route
 * that a record key can call.
 */
export type AttachmentOwner =
  | { sessionId: string }
  | { runId: string }
  | { projectId: string; ciBuildId: string }
  | { projectId: string; ci: { provider: string | null; params: unknown } };

export type AddAttachmentsResponse = {
  level?: 'run' | 'instance' | 'test' | 'attempt';
  attachments: {
    attachmentId: string;
    name: string;
    type: FileType;
    uploadUrl: string;
    /** Exactly the headers the signed URL accepts. */
    uploadHeaders: Record<string, string>;
  }[];
  uploadExpiresInSeconds: number;
};

export function createAttachments(
  credentials: ApiCredentials,
  owner: AttachmentOwner,
  target: RunAttachmentTarget,
  attachments: AttachmentDeclaration[]
) {
  debug('Create attachments: %o', { owner, target, attachments });
  if ('sessionId' in owner) {
    return post<AddAttachmentsResponse, unknown>(
      `v1/sessions/${encodeURIComponent(owner.sessionId)}/attachments`,
      credentials,
      { attachments }
    );
  }
  if ('runId' in owner) {
    return post<AddAttachmentsResponse, unknown>(
      `v1/runs/${encodeURIComponent(owner.runId)}/attachments`,
      credentials,
      { ...target, attachments }
    );
  }
  return post<AddAttachmentsResponse, unknown>(
    'v1/runs/attachments',
    credentials,
    { ...owner, ...target, attachments }
  );
}

export type CreateShareParams = {
  sessionId: string;
  purpose: 'report';
  expiresInDays?: 1 | 3 | 7;
};

export type CreateShareResponse = {
  purpose: string;
  url: string;
  pageUrl: string;
  expiresAt: string;
};

export function createShare(apiKey: string, params: CreateShareParams) {
  return post<CreateShareResponse, CreateShareParams>(
    'v1/share',
    { apiKey },
    params
  );
}
