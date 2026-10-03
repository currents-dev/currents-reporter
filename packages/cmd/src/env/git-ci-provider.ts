import { defaultTo, transform } from 'lodash';
import { debug as _debug } from '../debug';
import { removeAuthFromUrl } from '../lib/url';
import { getCommitParams } from './ciProvider';
import { GhaEventData } from './gitInfo';
import { CiProvider, CiProviderData } from './types';

const debug = _debug.extend('ci-git');

/**
 * A CI provider can put a token in the remote URL, for example GitLab's
 * CI_REPOSITORY_URL. It is removed wherever the commit data goes: the debug
 * output and the requests.
 */
function withoutRemoteAuth<T>(info: T): T {
  const remote = (info as { remoteOrigin?: unknown } | null)?.remoteOrigin;
  return typeof remote === 'string'
    ? { ...info, remoteOrigin: removeAuthFromUrl(remote) }
    : info;
}

export function mergeGitCommit(existingInfo: CiProviderData) {
  debug('git commit existing info: %O', withoutRemoteAuth(existingInfo));

  const commitParamsObj = getCommitParams();
  debug(
    'commit info from provider environment variables: %O',
    withoutRemoteAuth(commitParamsObj)
  );

  // based on the existingInfo properties
  // merge in the commitParams if null or undefined
  // defaulting back to null if all fails
  // NOTE: only properties defined in "existingInfo" will be returned
  const combined = transform(
    existingInfo,
    (
      memo: { [memoKey: string]: string | GhaEventData | null },
      value: string | GhaEventData | null,
      key: string
    ) => {
      const _value =
        value ||
        (commitParamsObj ? commitParamsObj[key as keyof CiProvider] : null);
      return (memo[key] = defaultTo(_value, null));
    }
  );

  const sanitized = withoutRemoteAuth(combined);
  debug('combined git and environment variables from provider: %O', sanitized);

  return sanitized;
}
