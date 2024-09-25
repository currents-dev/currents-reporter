import { defaultTo, transform } from "lodash";
import { debug as _debug } from "../debug";
import { getCommitParams } from "./ciProvider";
import { GhaEventData } from "./gitInfo";
import { CiProvider, CiProviderData } from "./types";

const debug = _debug.extend("ci-git");

export function mergeGitCommit(existingInfo: CiProviderData) {
  debug("git commit existing info: %O", existingInfo);

  const commitParamsObj = getCommitParams();
  debug("commit info from provider environment variables: %O", commitParamsObj);

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

  debug("combined git and environment variables from provider: %O", combined);

  return combined;
}
