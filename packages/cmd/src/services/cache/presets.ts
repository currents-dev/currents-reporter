import { debug } from '@debug';
import _ from 'lodash';
import { PRESET_OUTPUT_PATH } from '../../commands/cache/options';

import { CacheGetCommandConfig } from '../../config/cache';
import { getCI } from '../../env/ciProvider';
import {
  GithubActionsParams,
  GitLabParams,
  CircleParams,
} from '../../env/types';
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
    case 'circle':
      await dumpPWConfigForCircle(config, ci);
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
    case 'circle':
      await dumpPWConfigForCircle(config, ci, meta);
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
  const ciParams = ci.params as GitLabParams;
  const prevCiParams = meta?.ci.params as null | GitLabParams;
  const prevRunAttempt = prevCiParams
    ? parseIntSafe(prevCiParams.runAttempt, 0)
    : 0;
  const runAttempt = prevRunAttempt + 1;
  const nodeIndex = parseIntSafe(ciParams.ciNodeIndex, 1);
  const jobTotal = parseIntSafe(ciParams.ciNodeTotal, 1);

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
    config.presetOutput ?? PRESET_OUTPUT_PATH,
    `EXTRA_PW_FLAGS="${pwCliOptions}"
EXTRA_PWCP_FLAGS="${lastFailedOption}"
RUN_ATTEMPT="${runAttempt}"
`
  );
}

async function dumpPWConfigForGHA(
  config: CacheGetCommandConfig,
  ci: ReturnType<typeof getCI>
) {
  const { matrixIndex, matrixTotal } = config;
  const ciParams = ci.params as GithubActionsParams;
  const runAttempt = parseIntSafe(ciParams.githubRunAttempt, 1);

  const lastFailedOption = runAttempt > 1 ? '--last-failed' : '';

  let shardOption = '';
  if (matrixTotal > 1) {
    shardOption =
      runAttempt > 1 ? '--shard=1/1' : `--shard=${matrixIndex}/${matrixTotal}`;
  }

  const pwCliOptions = [lastFailedOption, shardOption]
    .filter(Boolean)
    .join(' ');
  const dumpPath = config.presetOutput ?? PRESET_OUTPUT_PATH;
  await writeFileAsync(dumpPath, pwCliOptions);
  debug('Dumped PW config: "%s" for GHA to %s', pwCliOptions, dumpPath);
}

async function dumpPWConfigForCircle(
  config: CacheGetCommandConfig,
  ci: ReturnType<typeof getCI>,
  meta: MetaFile | null = null
) {
  const ciParams = ci.params as CircleParams;

  const prevCiParams = meta?.ci.params as null | CircleParams;
  const prevWorkflowId = prevCiParams?.circleWorkflowId;
  const prevWorkspaceId = prevCiParams?.circleWorkflowWorkspaceId;
  const nodeIndex = parseIntSafe(ciParams.circleNodeIndex, 0);
  const nodeTotal = parseIntSafe(ciParams.circleNodeTotal, 1);
  const isRerun =
    prevWorkspaceId == ciParams.circleWorkflowWorkspaceId &&
    prevWorkflowId !== ciParams.circleWorkflowId;

  const lastFailedOption = isRerun ? '--last-failed' : '';

  let shardOption = '';
  if (nodeTotal > 1) {
    shardOption = isRerun
      ? '--shard=1/1'
      : `--shard=${nodeIndex + 1}/${nodeTotal}`;
  }

  const pwCliOptions = [lastFailedOption, shardOption]
    .filter(Boolean)
    .join(' ');
  const dumpPath = config.presetOutput ?? PRESET_OUTPUT_PATH;
  await writeFileAsync(dumpPath, pwCliOptions);
  debug('Dumped PW config: "%s" for Circle to %s', pwCliOptions, dumpPath);
}

const parseIntSafe = (
  value: string | undefined,
  defaultValue: number
): number => {
  const parsed = _.toNumber(value);
  return _.isNaN(parsed) ? defaultValue : parsed;
};
