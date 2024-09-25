import { GhaEventData } from "./gitInfo";
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

export type GithubActionsParams = {
  githubWorkflow: string;
  githubAction: string;
  githubEventName: string;
  githubRunId: string;
  githubRunAttempt: string;
  githubRepository: string;

  ghStrategyJobIndex?: string;
  ghStrategyJobTotal?: string;
};


export type GitLabParams = {
  gitlabCi: string;
  ciPipelineId: string;
  ciPipelineUrl: string;
  ciBuildId: string;
  ciJobId: string;
  ciJobUrl: string;
  ciJobName: string;
  gitlabHost: string;
  ciProjectId: string;
  ciProjectUrl: string;
  ciRepositoryUrl: string;
  ciEnvironmentUrl: string;
  ciDefaultBranch: string;
  ciNodeIndex?: string;
  ciNodeTotal?: string;
  runAttempt?: string;
};