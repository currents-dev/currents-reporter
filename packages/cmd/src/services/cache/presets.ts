import { debug } from '@debug';
import _ from 'lodash';
import { PW_CONFIG_DUMP_FILE } from '../../commands/cache/options';

import { CacheGetCommandConfig } from '../../config/cache';
import { getCI } from '../../env/ciProvider';
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
  const variables = getGHAEnvironementVariables(ci);
  debug('GHA environment variables: %O', variables);
  const { runAttempt, nodeIndex, jobTotal } = variables;
  const lastFailedOption = runAttempt > 1 ? '--last-failed' : '';

  let shardOption = '';
  if (jobTotal > 1) {
    shardOption =
      runAttempt > 1 ? '--shard=1/1' : `--shard=${nodeIndex}/${jobTotal}`;
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

function getGHAEnvironementVariables(ci: ReturnType<typeof getCI>) {
  const { GITHUB_RUN_ATTEMPT, GITHUB_REPOSITORY, GITHUB_RUN_ID } = ci.params;
  const { GH_STRATEGY_NODE_INDEX, GH_STRATEGY_JOB_TOTAL } = process.env;

  return {
    githubRepo: GITHUB_REPOSITORY,
    runId: GITHUB_RUN_ID,
    runAttempt: parseIntSafe(GITHUB_RUN_ATTEMPT, 1),
    nodeIndex: parseIntSafe(GH_STRATEGY_NODE_INDEX, 0),
    jobTotal: parseIntSafe(GH_STRATEGY_JOB_TOTAL, 1),
  };
}
