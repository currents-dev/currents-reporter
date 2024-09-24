import _ from "lodash";
import { PW_CONFIG_DUMP_FILE } from "../../commands/cache/options";

import { CacheGetCommandConfig } from "../../config/cache";
import { getCI } from "../../env/ciProvider";
import { writeFileAsync } from "../../lib";

export async function handleLastRunPreset(
  config: CacheGetCommandConfig,
  ci: ReturnType<typeof getCI>
) {
  switch (ci.provider) {
    case "GITHUB_ACTIONS":
      await dumpPWConfigForGHA(config, ci);
      break;
    default:
      break;
  }
}

async function dumpPWConfigForGHA(
  config: CacheGetCommandConfig,
  ci: ReturnType<typeof getCI>
) {
  const runAttempt = parseIntSafe(ci.params.GITHUB_RUN_ATTEMPT, 1);
  const nodeIndex = parseIntSafe(process.env.GH_STRATEGY_NODE_INDEX, 1);
  const jobTotal = parseIntSafe(process.env.GH_STRATEGY_JOB_TOTAL, 1);

  const lastFailedOption = runAttempt > 1 ? "--last-failed" : "";

  let shardOption = "";
  if (jobTotal > 1) {
    shardOption =
      runAttempt > 1 ? "--shard=1/1" : `--shard=${nodeIndex}/${jobTotal}`;
  }

  const pwCliOptions = [lastFailedOption, shardOption]
    .filter(Boolean)
    .join(" ");
  await writeFileAsync(config.pwConfigDump ?? PW_CONFIG_DUMP_FILE, pwCliOptions);
}

const parseIntSafe = (
  value: string | undefined,
  defaultValue: number
): number => {
  const parsed = _.toNumber(value);
  return _.isNaN(parsed) ? defaultValue : parsed;
};
