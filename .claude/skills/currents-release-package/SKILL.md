---
name: currents-release-package
description: Release one package of this repo to npm — @currents/cmd, @currents/jest, @currents/node-test-reporter or @currents/rules. Covers the release branch, the version and CHANGELOG commit, the release PR, the tag, the GitHub release, the publish workflow and the check of the published package. Use for latest releases, alpha and beta prereleases, and fixes to an older version line.
argument-hint: <package> <version> [channel]
---

# Release a package to npm

Arguments: the package (`cmd`, `jest`, `node-test-reporter`, `rules`, or the
full `@currents/...` name), the version, and the npm channel. Without a
channel, a version like `2.4.0` goes to `latest` and `2.4.0-beta.0` goes to
`beta`. Ask for anything missing.

A release changes four things outside the repo: a git tag, a GitHub release,
the npm package and its dist-tag, and, for `latest`, the Linear release and a
Slack message. The operator runs the commands that create them. Give each
command ready to run with `!`. You prepare the release commit, open the PR,
merge it when approved, and check the result.

## How releases work here

- Each package has a `release-it` config in its `package.json`. The tag is
  `@currents/<package>-v<version>`. The release commit message is
  `chore: release @currents/<package> v<version>`. The GitHub release is
  named `@currents/<package> v<version>`.
- `.github/workflows/publish.yaml` publishes. It is started by hand with a
  package and a channel (`alpha`, `beta`, `latest`, `oldversion`). It
  publishes the version in `packages/<package>/package.json` of the ref it
  runs on. It does not check that the version fits the channel: you check.
- For `latest`, the publish workflow also completes the package's Linear
  release and posts to Slack. `@currents/rules` has no Linear pipeline.
- Pushing a tag runs `.github/workflows/linear-release.yaml`, which syncs the
  tag to the package's Linear release pipeline.
- Release PRs are merged with a merge commit, so the tagged commit is on the
  base branch. Other PRs are squashed.

## 1. Pick the base branch

- A release of the current major: base on `main`.
- A fix to an older version line, for example 1.5.x when `main` has 2.0.0:
  base on `release/<package>-<major>.<minor>.x`. Create it from the commit the
  last version of that line was published from, which is the tag
  `@currents/<package>-v<version>`. Check the workflows on it: their
  `pull_request` branches must include `release/**`, or the PR gets no CI.
  Add it in the PR if it is missing.

Before you start:

- Check that nobody else is releasing the package: open PRs from `release/`
  branches (`gh pr list --search 'head:release/'`) and publish runs in
  progress (`gh run list --workflow publish.yaml`).
- `npm view @currents/<package> dist-tags` shows what each channel has now.
  The new version must be higher than the channel's current version.

## 2. Make the release commit

Branch `release/<package>-<version>` from the base, then in
`packages/<package>`:

```bash
npx release-it <version> --ci --no-git.commit --no-git.tag --no-git.push \
  --no-github.release --no-git.requireUpstream
```

This sets the version in `package.json` and adds a CHANGELOG section. It
does not commit, tag or push. Then fix what it gets wrong:

- The compare link in the heading ends in `%24%7Bnpm.name%7D-v<version>`.
  Replace that part with `%40currents%2F<package>-v<version>`.
- It lists every `feat` and `fix` commit in the repo since the package's last
  tag, including commits for other packages. Keep an entry only if the commit
  changes `packages/<package>` or the package's runtime dependencies in
  `package-lock.json`. `git log <last tag>..HEAD -- packages/<package>` lists
  the first kind.
- Under the heading, write a short paragraph on what users of the package
  notice: what works now that did not, what they have to change. The earlier
  sections in the CHANGELOG show the style.
- Set the version of the `packages/<package>` entry in the root
  `package-lock.json`. release-it does not change it. Change only that line,
  then check that `npm ci --dry-run` works.

Commit with `chore: release @currents/<package> v<version>`.

## 3. Check the package before the PR

From the release branch:

- The package's `build`, `types`, `lint` and `test` scripts, where it has
  them. Run the tests on the lowest Node.js version its `engines` allows and
  on the newest one in `.github/workflows/unit-test.yaml`.
- `npm pack` the package, install the tarball in an empty folder, and run it:
  - cmd: `npx currents --version` prints the new version, and the `--help` of
    the commands that changed shows the new options.
  - jest: a small Jest project with the reporter runs and writes its report.
  - node-test-reporter: `node --test` with the reporter writes its report.
- For each fix in the release, reproduce the failure with the previous
  version and check that the packed version does not have it.

## 4. Open the release PR

- Title: the release commit message.
- Base: the base branch from step 1.
- Body: what the release contains with PR links, the checks from step 3 with
  their results, and that the PR is merged with a merge commit. Start with an
  `Owner: @<login>` line naming the operator.
- Load the `writing-voice` skill if it is available, and show the body to the
  operator before you open the PR.

Wait for CI and an approval. Fix review findings on the branch. If the
release commit changes, the tag in step 5 goes on the new commit.

## 5. Tag, release, merge, publish

Write the release notes to a file in the scratchpad: the CHANGELOG section
without its heading. Then give the operator these commands, in this order:

```bash
git tag -a '@currents/<package>-v<version>' <release commit> -m 'Release <version>'
git push origin '@currents/<package>-v<version>'
gh release create '@currents/<package>-v<version>' --verify-tag \
  --title '@currents/<package> v<version>' --notes-file <notes file>
```

For an alpha or beta, add `--prerelease` to `gh release create`.

When the PR is approved and CI passes, merge it with a merge commit:
`gh pr merge <n> --merge`. Then give the operator the publish command, with
the base branch as the ref:

```bash
gh workflow run publish.yaml --ref <base branch> \
  -f package=@currents/<package> -f channel=<channel>
```

## 6. Check the published package

- Watch the publish run to the end: `gh run watch <run id> --exit-status`.
  For `latest`, the Linear and Slack steps must pass too.
- `npm view @currents/<package> dist-tags` shows the new version on the
  channel. `npm view @currents/<package>@<version> dist.attestations` shows
  the provenance.
- Install the version from npm in an empty folder and repeat the checks from
  step 3.

If the published version is broken, give the operator the commands to move
the channel back and mark the version:

```bash
npm dist-tag add @currents/<package>@<previous version> <channel>
npm deprecate @currents/<package>@<version> "<what is broken>; use <previous version>"
```

Do not unpublish: lockfiles that already have the version stop installing.

## Report

End with a table of the steps — release commit, PR, tag, GitHub release,
merge, publish run, npm dist-tag, check from npm — each linked to its PR,
run, release or npm page, with the evidence you checked.
