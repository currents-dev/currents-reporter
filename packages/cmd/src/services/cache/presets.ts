import { debug } from '@debug';
import _ from 'lodash';
import { PW_CONFIG_DUMP_FILE } from '../../commands/cache/options';

import { CacheGetCommandConfig } from '../../config/cache';
import { getCI } from '../../env/ciProvider';
import { GithubActionsParams } from '../../env/types';
import { writeFileAsync } from '../../lib';
import { MetaFile } from './lib';

export async function handlePreLastRunPreset(
  config: CacheGetCommandConfig,
  ci: ReturnType<typeof getCI>
) {
  switch (ci.provider) {
    case 'githubActions':
      await dumpPWConfigForGHA(config, ci);
      break;
    case 'gitlab':
      await dumpPwConfigForGitlab(config, ci);
      break;
    default:
      break;
  }
}

export async function handlePostLastRunPreset(
  config: CacheGetCommandConfig,
  ci: ReturnType<typeof getCI>,
  meta: MetaFile
) {
  switch (ci.provider) {
    case 'gitlab':
      await dumpPwConfigForGitlab(config, ci, meta);
      break;
    default:
      break;
  }
}

async function dumpPwConfigForGitlab(
  config: CacheGetCommandConfig,
  ci: ReturnType<typeof getCI>,
  meta: MetaFile | null = null
) {
  const previousRunAttempt = meta
    ? parseIntSafe(meta.ci.params?.runAttempt, 0)
    : 0;
  const runAttempt = previousRunAttempt + 1;
  const nodeIndex = parseIntSafe(process.env.CI_NODE_INDEX, 1);
  const jobTotal = parseIntSafe(process.env.CI_NODE_TOTAL, 1);

  const lastFailedOption = runAttempt > 1 ? '--last-failed' : '';

  let shardOption = '';
  if (jobTotal > 1) {
    shardOption =
      runAttempt > 1 ? '--shard=1/1' : `--shard=${nodeIndex}/${jobTotal}`;
  }

  const pwCliOptions = [lastFailedOption, shardOption]
    .filter(Boolean)
    .join(' ');

  await writeFileAsync(
    config.pwConfigDump ?? PW_CONFIG_DUMP_FILE,
    `EXTRA_PW_FLAGS="${pwCliOptions}"
RUN_ATTEMPT="${runAttempt}"
`
  );
}

async function dumpPWConfigForGHA(
  config: CacheGetCommandConfig,
  ci: ReturnType<typeof getCI>
) {
  const ciParams = ci.params as GithubActionsParams;
  const runAttempt = parseIntSafe(ciParams.githubRunAttempt, 1);
  const jobIndex = parseIntSafe(ciParams.ghStrategyJobIndex, 0);
  const jobTotal = parseIntSafe(ciParams.ghStrategyJobTotal, 1);

  const lastFailedOption = runAttempt > 1 ? '--last-failed' : '';

  let shardOption = '';
  if (jobTotal > 1) {
    // GH_STRATEGY_JOB_INDEX is 0-based, but --shard is 1-based
    const currentShard = jobIndex + 1;

    shardOption =
      runAttempt > 1 ? '--shard=1/1' : `--shard=${currentShard}/${jobTotal}`;
  }

  const pwCliOptions = [lastFailedOption, shardOption]
    .filter(Boolean)
    .join(' ');

  const dumpPath = config.pwConfigDump ?? PW_CONFIG_DUMP_FILE;
  await writeFileAsync(dumpPath, pwCliOptions);
  debug('Dumped PW config: "%s" for GHA to %s', pwCliOptions, dumpPath);
}

const parseIntSafe = (
  value: string | undefined,
  defaultValue: number
): number => {
  const parsed = _.toNumber(value);
  return _.isNaN(parsed) ? defaultValue : parsed;
};
