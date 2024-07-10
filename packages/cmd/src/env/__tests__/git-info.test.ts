import { describe, expect, it } from "vitest";
import { mergeGitCommit } from "../git-ci-provider";

describe("git-info", () => {
  it("should merge the git info for teamcity", () => {
    const expected = {
      branch: "main",
      remoteOrigin: "origin",
      ghaEventData: null,
    };
    // eslint-disable-next-line turbo/no-undeclared-env-vars
    process.env.TEAMCITY_VERSION = "1";
    const result = mergeGitCommit({
      branch: "main",
      remoteOrigin: "origin",
      ghaEventData: null,
    });
    expect(result).toMatchObject(expected);
  });
});
