import { GhaEventData } from './gitInfo';
export type CiProvider = string | null;

export type CiProviderData = {
  sha?: string;
  branch?: string;
  message?: string;
  authorName?: string;
  authorEmail?: string;
  remoteOrigin?: string;
  defaultBranch?: string;
  remoteBranch?: string;
  runAttempt?: string;
  ghaEventData?: GhaEventData | null;
};
