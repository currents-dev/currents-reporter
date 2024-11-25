export type ReportOptions = {
  configFilePath?: string;
  reportDir?: string;
};

export type UploadMarkerInfo = {
  response: {
    runUrl: string;
    runId: string;
  };
  isoDate: string;
};

export type CLIArgs = {
  options: Record<string, unknown>;
  args: string[];
};

export type ReportConfig = {
  framework: string;
  frameworkVersion: string | null;
  cliArgs: CLIArgs;
  frameworkConfig: Record<string, unknown>;
};
