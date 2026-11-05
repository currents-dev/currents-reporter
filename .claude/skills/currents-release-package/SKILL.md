---
name: currents-release-package
description: Release one package of this repo to npm, end to end — @currents/cmd, @currents/jest, @currents/node-test-reporter or @currents/rules. Covers the version check, the release branch, the version and CHANGELOG commit, the release PR, the merge, the tag, the GitHub release, the publish workflow, the check of the published package, the Linear release with its issues and release notes, the Notion release page, and the #releases messages in Slack. Use for latest releases, alpha and beta prereleases, and fixes to an older version line (the oldversion channel).
argument-hint: <package> [version] [channel]
---

# Release a package to npm

You do every step. The operator only:

1. Confirms the version and channel, when you propose a different one than
   they asked for, or when the release is a new major version (step 2).
2. Approves the release PR on GitHub (step 5).
3. Approves the two Slack messages, shown together after the publish is
   verified (step 10). Messages posted as the operator always need their
   approval.

Between these, do not stop to ask. If the harness blocks a command, such as
the tag push, the GitHub release or the publish run, give the operator the
exact command to run with `!`, and continue when it has run.

## How releases work here

- Each package has a `release-it` config in its `package.json`:
  - The tag is `@currents/<package>-v<version>`.
  - The CHANGELOG section lists only commits that change
    `packages/<package>`, and the recommended version is based on the same
    commits.
  - A hook sets the package's version in the root `package-lock.json`
    (`scripts/set-lockfile-version.js`).
  - The release commit message is
    `chore: release @currents/<package> v<version>`.
  - The GitHub release is named `@currents/<package> v<version>`.
- `.github/workflows/publish.yaml` publishes the version in
  `packages/<package>/package.json` of the ref it runs on, to the channel you
  give it (`alpha`, `beta`, `latest`, `oldversion`). It does not check that
  the version fits the channel: you check, in step 2. For `latest`, it also
  completes the Linear release that has the version, and posts its own short
  message to `#releases`. For `@currents/rules`, which has no Linear pipeline,
  it skips both.
- Pushing a tag runs `.github/workflows/linear-release.yaml`, which syncs the
  tag to the package's Linear release pipeline, whatever the channel.
- Release PRs are merged with a merge commit, so the tagged commit is on the
  base branch. Other PRs are squashed.
- Dates in the CHANGELOG are UTC: release-it writes the UTC date. Leave it.

Never move `latest` back, never unpublish, and tag only the commit the
operator approved in the PR.

## 1. Arguments and base branch

- Package: remove a leading `@currents/`. The rest must be `cmd`, `jest`,
  `node-test-reporter` or `rules`; stop if it is not. In this skill,
  `<package>` is this short name, and the npm name is `@currents/<package>`.
- Base branch:
  - A release of the current major: `main`.
  - A fix to an older version line, for example 1.5.x when `latest` is
    2.0.0: `release/<package>-<major>.<minor>.x`. Create it from the tag of
    the last version of that line. Its workflows' `pull_request` branches must
    include `release/**`, or the PR gets no CI; add it in the PR if it is
    missing.
- Check that nobody else is releasing the package: open PRs from `release/`
  branches (`gh pr list --search 'head:release/'`) and publish runs in
  progress (`gh run list --workflow publish.yaml`).

## 2. Check the version

Work in a new worktree of the base branch, not in a checkout someone else
uses. In `packages/<package>`:

1. List the commits since the package's last tag that change it:
   `git log --format='%h %s' <last tag>..HEAD -- .`. If there are none, there
   is nothing to release: stop and say so.
2. Ask release-it for the version the commits call for:

   ```bash
   npx release-it --ci --release-version --no-github.release --no-git.requireUpstream
   ```

   For an alpha or beta, add `--preRelease=<alpha|beta>`. A commit with `!`
   after its type, or a `BREAKING CHANGE:` footer, makes it a major version;
   a `feat` makes it a minor one.

3. Compare with what the operator asked for:
   - No version given: propose release-it's version.
   - The requested version is lower than release-it's, for example a patch
     when a commit is breaking: propose release-it's version, and name the
     commits that make the difference. A breaking change released as a patch
     breaks every user on the old major.
   - The version is a new major: ask the operator to confirm it, with the
     breaking commits.
   - Otherwise, continue without asking.
4. Pick the channel. These rules decide it when none is given, and check it
   when the operator gives one:
   - `2.4.0-beta.0` goes to `beta`, and `2.4.0-alpha.0` goes to `alpha`: the
     channel is the version's prerelease name. A prerelease never goes to
     `latest` or `oldversion`. The workflow has no channel for other names,
     such as `rc`: stop and propose an `alpha` or `beta` version instead.
   - `2.4.0` goes to `latest` only when it is higher than
     `npm view @currents/<package> dist-tags.latest`. Otherwise it goes to
     `oldversion`: a fix to an older version line must not move `latest`
     back. A version without a prerelease part never goes to `alpha` or
     `beta`.
   - If a channel the operator gave breaks one of these rules, stop and
     propose the channel the rules give. Do not tag or publish until the
     version and the channel agree.

Show the version, the channel and the base branch in one message. Wait for
the operator only in the cases above.

## 3. Make the release commit

Branch `release/<package>-<version>` from the base, then in
`packages/<package>`:

```bash
npx release-it <version> --ci --no-git.commit --no-git.tag --no-git.push \
  --no-github.release --no-git.requireUpstream
```

This sets the version in `package.json` and in the root `package-lock.json`,
and adds the CHANGELOG section. Then:

- Write a short paragraph under the heading on what users of the package
  notice: what works now that did not, and what they have to change. The
  earlier sections in the CHANGELOG show the style.
- A squash commit can contain other PRs, listed in its body
  (`git show -s --format=%B <sha>`). For example, #477 contained #478 to
  #480. When the change to this package came from one of them, link that PR
  in the entry too. `gh pr view <n> --json files` shows which PR changed the
  package.
- `npm ci --dry-run` must pass.

Commit `packages/<package>` and `package-lock.json` with
`chore: release @currents/<package> v<version>`.

## 4. Check the package

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
  version and check that the packed version does not have it. When the
  failure depends on the version of a dependency of a dependency, pin that
  version with `overrides` in the test project: a fresh install can get a
  newer version without the failure. For example, the Node.js 26 failure of
  @currents/jest 1.5.1 needs yargs 17.7.2; yargs 17.7.3 does not fail. Say
  which version you pinned in the PR.

## 5. Open the release PR and merge it

- Title: the release commit message. Base: the base branch.
- Body: start with an `Owner: @<login>` line naming the operator. Then what
  the release contains, with PR links; the version check from step 2; the
  checks from step 4 with their results; and that the PR is merged with a
  merge commit.
- Load the `writing-voice` skill if it is available.

Wait for CI and the operator's approval. Fix review findings on the branch,
and run the checks from step 4 again if the package changed. When the PR is
approved and CI passes, merge it: `gh pr merge <n> --merge`.

## 6. Tag and GitHub release

Tag the release commit that was approved, not the merge commit. Before you
push the tag, note the releases in the package's Linear pipeline (step 7),
with their versions: `list_releases({ pipeline: <slug>, limit: 5 })`.

Write the release notes to a file in the scratchpad: the CHANGELOG section
without its heading. Then:

```bash
git tag -a '@currents/<package>-v<version>' <release commit> -m 'Release <version>'
git push origin '@currents/<package>-v<version>'
gh release create '@currents/<package>-v<version>' --verify-tag \
  --title '@currents/<package> v<version>' --notes-file <notes file>
```

For an alpha or beta, add `--prerelease` to `gh release create`.

## 7. Linear release

Skip this step for `@currents/rules`, which has no pipeline.

The pipelines are `@currents/cmd` (slug `currentscmd`), `@currents/jest`
(`currentsjest`) and `@currents/node-test-reporter`
(`currentsnode-test-reporter`). Each push to `main` adds commits to the
pipeline's started release, usually named "New release". The tag push gives a
release the version, and the publish to `latest` completes the release that
has the version. Linear does not reliably attach the issues, and it writes no
release notes, so you do both. Do this step before the publish: for
`latest`, the publish completes the Linear release and marks its tickets
Done.

For every channel except `latest`, only check what the tag did, and change
nothing else in Linear. When the Linear Release run for the tag has finished,
list the releases again and compare with what you noted in step 6. If the tag
gave its version to an existing release, for example the started release that
collects `main`, or created a new release, tell the operator what changed and
ask whether to put the old version back
(`save_release({ id, version: <old version> })`) or to cancel the new
release.

For `latest`:

1. Find the release that the tag gave the version:
   `list_releases({ pipeline: <slug>, version: <version> })`.
   - One release: use it.
   - None, after the Linear Release run for the tag finished: create it with
     `save_release({ pipeline: <slug>, name: '@currents/<package> <version>', version: <version>, commitSha: <release commit> })`.
   - More than one: stop and ask the operator.

   If the release is the pipeline's started release and its issues include
   work that is not in this version, stop and ask. This happens when a fix
   from a `release/<package>-<major>.<minor>.x` branch takes the release that
   collects the next version from `main`.

2. Name it `@currents/<package> <version>`, and give it a one-line
   description of what changed:
   `save_release({ id, name, description, commitSha: <release commit> })`.

3. List the tickets of the release: ticket IDs (`ENG-NNN`) in the commits
   from step 2, and in the titles and descriptions of their PRs, including
   the PRs inside squash commits. `CSR-0` means "no ticket". A ticket named
   only in a PR description, or only for context ("as in ENG-1680"), is not
   attached until the operator confirms it. When no commit or PR names a
   ticket, steps 3 and 4 have nothing to do: continue without asking.

   Attach each ticket: `save_issue({ id, addReleases: [<release id>] })`. If
   a ticket is on the pipeline's started release, also remove it there with
   `removeReleases`.

4. Completing the release marks every attached ticket Done. A ticket with
   more work to come, for example more PRs or a customer reply, moves to the
   started release:
   `save_issue({ id, addReleases: [<started release id>], removeReleases: [<this release id>] })`.
   Ask the operator which tickets have more work to come, only when there are
   tickets.

5. Write the release notes, in the structure below. Check
   `list_release_notes({ pipeline: <slug>, release: <release id> })` first
   and update the note if one exists.

   ```
   save_release_note({
     pipeline: <slug>,
     releases: [<release id>],
     title: '@currents/<package> <version>',
     content: <the Linear release notes>
   })
   ```

6. After the publish (step 8): `get_release` shows the stage `Released`, and the
   tickets are Done, except the ones you moved.

## 8. Publish and check

Run the publish on the tag from step 6, not on the base branch: the workflow
builds the ref it runs on, and the branch can have moved since the merge.

```bash
gh workflow run publish.yaml --ref '@currents/<package>-v<version>' \
  -f package=@currents/<package> -f channel=<channel>
gh run watch <run id> --exit-status
```

For `latest`, the steps "Mark Linear release as complete" and "Post to Slack"
must pass too, except for `@currents/rules`: the workflow skips both for it,
and skipped is the expected result.

Then check the registry. npm can show the old version for a few minutes after
the run, so poll every 15 seconds for up to 5 minutes before you call it a
failure:

```bash
npm view @currents/<package> dist-tags --json --prefer-online
npm view @currents/<package>@<version> dist.attestations --prefer-online
```

The channel has the new version, and the version has provenance. Install the
version from npm in an empty folder and repeat the checks from step 4.

If the published version is broken, move the channel back and mark the
version:

```bash
npm dist-tag add @currents/<package>@<previous version> <channel>
npm deprecate @currents/<package>@<version> "<what is broken>; use <previous version>"
```

Do not unpublish: lockfiles that already have the version stop installing.

## 9. Notion release page

Skip this step for `@currents/rules` and for every channel except `latest`.

Package releases have a page in the Releases database, the same database as
the platform releases: data source
`collection://197be2b5-c1d5-80fb-90e2-000bdd6ed896`. The page is named
`@currents/<package>@<version>`, for example `@currents/cmd@1.9.9`.

Check that no page has the name, with `notion-search` on that data source.
Match the title exactly. Then create the page with `notion-create-pages`:

| Property                     | Value                                                  |
| ---------------------------- | ------------------------------------------------------ |
| Name                         | `@currents/<package>@<version>`                        |
| Release Date                 | the date in the CHANGELOG heading                      |
| Diff Link                    | the compare URL from the CHANGELOG heading             |
| Services                     | `@currents/<package>`                                  |
| Released by                  | the operator                                           |
| Impact                       | `Major Changes`, `Fixes`, or `Fixes and Small Changes` |
| Production deployed & tested | yes, after the checks from npm in step 8 pass          |

The content follows the Notion page structure below. Tick "Notify team about
the release" when the Slack messages are posted.

## 10. Slack

Write both messages after the publish is verified, show them to the operator
together, and post both after one approval. Channel: `#releases`
(`C075P0RFGAW`). Use Slack formatting: `*bold*`, `<url|label>` links and `•`
bullets. Markdown links do not render.

The publish workflow already posted "🚀 Release:
@currents/<package>@<version> has been marked as complete in Linear" for
`latest`. Use the same version and channel, so the messages agree.

The announcement:

```text
:rocket: Release: `@currents/<package> <version>` (npm `<channel>`)

<Notion page url|Release document> · <GitHub release url|GitHub release> ·
<Linear release url|Release notes> · <compare url|Diff>

<the CHANGELOG paragraph: what users of the package notice>

*Changes*
• *<change>* (<PR url|#NNN>) — @author, <Linear issue url|ENG-NNN>

*Needs attention*
• <breaking changes, a new minimum Node.js version, a new channel>
```

The reply in its thread, posted with `thread_ts` set to the announcement's
`ts` and `reply_broadcast: true`:

```text
*@currents/<package> <version>* is on npm `<channel>`.

Checked from npm: <one line per check from step 8>

Still open, moved to the next release:
• ENG-NNN: <why>

<npm url|npm> · <publish run url|Publish run>
```

Leave out a heading or line that has nothing in it. For channels other than
`latest`, leave out the Notion and Linear links and "Still open", because
steps 7 and 9 made no release or page, and post the reply without
`reply_broadcast`. If you rolled the version back, say so in the reply.

## Report

End with a table of the steps — version check, release commit, PR, merge,
tag, GitHub release, publish run, npm dist-tag, check from npm, Linear
release, Notion page, Slack messages — each linked to its PR, run, release,
page, message or npm page, with the evidence you checked.

## Release notes structure

The Linear release notes and the Notion page use the same parts, in the same
order, every time. Write each part once, from the CHANGELOG section of the
release commit, and use it in both places. Leave out a part that has nothing
in it; never leave an empty heading.

- Summary: one paragraph, at most four sentences, on what users of the
  package notice. The CHANGELOG paragraph under the version heading.
- Breaking changes: one bullet per change, each with what users have to
  change.
- Features and Bug fixes: the CHANGELOG entries, one bullet each, with the PR
  link.
- Issues: one bullet per ticket, with a few words on what it is.
- Links: the GitHub release and the package's CHANGELOG.

Linear release notes, in Markdown:

```markdown
<Summary>

**Breaking changes**

- <change>: <what users have to change>

**Features**

- <entry> ([#NNN](<PR url>))

**Bug fixes**

- <entry> ([#NNN](<PR url>))

**Issues**

- [ENG-NNN](<Linear issue url>): <what it is>

[GitHub release](<GitHub release url>) · [CHANGELOG](<CHANGELOG url>)
```

Notion page. Copy the checklist items from the page of the previous version
of the package, all unticked:

```markdown
### Release Notes

<Summary>

#### Breaking changes

- <change>: <what users have to change>

#### Features

- <entry> ([#NNN](<PR url>))

#### Bug fixes

- <entry> ([#NNN](<PR url>))

#### Issues

- [ENG-NNN](<Linear issue url>): <what it is>

[GitHub release](<GitHub release url>) · [CHANGELOG](<CHANGELOG url>)

### Checklist

- [ ] <each item of the previous page's checklist>

### Public Changelog Items to Publish

- <one bullet per change that users of the package notice>
```

After you write either one, read it back (`get_release` with release notes,
or `notion-fetch`) and check that the headings are there, in this order, and
that no heading is empty.
