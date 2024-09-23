import path from "path";
import { CacheSetCommandConfig } from "../../config/cache";
import { warnWithNoTrace } from "../../logger";

export type MetaFile = {
  id: string;
  orgId: string;
  config: CacheSetCommandConfig;
  paths: string[];
  ci: Record<string, unknown>;
  createdAt: string;
};

export function createMeta({
  config,
  cacheId,
  orgId,
  paths,
  ci,
}: {
  config: CacheSetCommandConfig;
  cacheId: string;
  orgId: string;
  paths: string[];
  ci: Record<string, unknown>;
}) {
  const meta = {
    id: cacheId,
    orgId,
    config,
    paths,
    ci,
    createdAt: new Date().toISOString(),
  };

  return Buffer.from(JSON.stringify(meta));
}

export const getLastRunFilePath = (output?: string) =>
  path.resolve(output ?? "test-results", ".last-run.json");

export function warn(error: unknown, msg: string) {
  if (error instanceof Error) {
    warnWithNoTrace("%s. %s.", msg, error.message);
  } else {
    warnWithNoTrace("%s. %s.", msg, "Unknown error");
  }
}
