---
name: currents-release-package
description: Release one package of this repo to npm — @currents/cmd, @currents/jest, @currents/node-test-reporter or @currents/rules. Covers the release branch, the version and CHANGELOG commit, the release PR, the tag, the GitHub release, the Linear release with its issues and release notes, the Notion release page, the #releases announcement in Slack, the publish workflow, and the check of the published package. Use for latest releases, alpha and beta prereleases, and fixes to an older version line (the oldversion channel).
argument-hint: <package> <version> [channel]
---

# Release a package to npm

Arguments: the package, the version, and the npm channel. Ask for anything
missing.

- Package: remove a leading `@currents/`. The rest must be `cmd`, `jest`,
  `node-test-reporter` or `rules`; stop if it is not. In this skill,
  `<package>` is this short name, and the npm name is `@currents/<package>`.
- Channel, when none is given:
  - `2.4.0-beta.0` goes to `beta`, and `2.4.0-alpha.0` goes to `alpha`.
  - `2.4.0` goes to `latest` only when it is higher than
    `npm view @currents/<package> dist-tags.latest`. Otherwise it goes to
    `oldversion`: a fix to an older version line must not move `latest` back.
  - Tell the operator the channel before step 1.

A release changes these things outside the repo: a git tag, a GitHub release,
the npm package and its dist-tag, the Linear release, the Notion release page,
and messages in `#releases`. The operator runs the commands that create the
tag, the GitHub release and the npm package; give each command ready to run
with `!`. You prepare the release commit, open the PR, merge it when approved,
update the Linear release and the Notion page, post the Slack messages after
the operator approves each draft, and check the result.

## How releases work here

- Each package has a `release-it` config in its `package.json`. The tag is
  `@currents/<package>-v<version>`. The release commit message is
  `chore: release @currents/<package> v<version>`. The GitHub release is
  named `@currents/<package> v<version>`.
- `.github/workflows/publish.yaml` publishes. It is started by hand with a
  package and a channel (`alpha`, `beta`, `latest`, `oldversion`). It
  publishes the version in `packages/<package>/package.json` of the ref it
  runs on. It does not check that the version fits the channel: you check.
- Pushing a tag runs `.github/workflows/linear-release.yaml`, which syncs the
  tag to the package's Linear release pipeline. For `latest`, the publish
  workflow completes the Linear release that has the version, and posts a
  short message to `#releases`. `@currents/rules` has no Linear pipeline.
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

## 5. Tag and GitHub release

Write the release notes to a file in the scratchpad: the CHANGELOG section
without its heading. For a package with a Linear pipeline (step 6), note the
releases the pipeline has now, with their versions:
`list_releases({ pipeline: <slug>, limit: 5 })`. Then give the operator these
commands:

```bash
git tag -a '@currents/<package>-v<version>' <release commit> -m 'Release <version>'
git push origin '@currents/<package>-v<version>'
gh release create '@currents/<package>-v<version>' --verify-tag \
  --title '@currents/<package> v<version>' --notes-file <notes file>
```

For an alpha or beta, add `--prerelease` to `gh release create`.

## 6. Linear release

Skip this step for `@currents/rules`, which has no pipeline.

For every channel except `latest`, only check what the tag did, and change
nothing else in Linear: the publish workflow completes a Linear release only
for `latest`. The Linear Release workflow syncs every tag, whatever the
channel. When its run for the tag has finished, list the releases again and
compare with what you noted in step 5. If the tag gave its version to an
existing release, for example the started release that collects `main`, or
created a new release, tell the operator what changed and ask whether to put
the old version back (`save_release({ id, version: <old version> })`) or to
cancel the new release. The started release of `@currents/cmd` has the
version `2.0.0-beta.0`, most likely from such a tag.

The pipelines are `@currents/cmd` (slug `currentscmd`), `@currents/jest`
(`currentsjest`) and `@currents/node-test-reporter`
(`currentsnode-test-reporter`). Each push to `main` adds commits to the
pipeline's started release, usually named "New release". The tag push gives a
release the version, and the publish to `latest` completes the release that
has the version. Linear does not reliably attach the issues, and it writes no
release notes, so you do both.

1. Find the release that the tag push gave the version:
   `list_releases({ pipeline: <slug>, version: <version> })`.

   | Result                                                  | Action                                                                                                                       |
   | ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
   | One release                                             | Use it.                                                                                                                      |
   | None, after the Linear Release run for the tag finished | `save_release({ pipeline: <slug>, name: '@currents/<package> <version>', version: <version>, commitSha: <release commit> })` |
   | More than one                                           | Stop and ask the operator.                                                                                                   |

   If the release is the pipeline's started release and its issues include
   work that is not in this version, stop and ask. This happens when a fix
   from a `release/<package>-<major>.<minor>.x` branch takes the release that
   collects the next version from `main`.

2. Name it `@currents/<package> <version>`, and give it a one-line
   description of what changed:
   `save_release({ id, name, description, commitSha: <release commit> })`.

3. List the tickets of the release:
   - Ticket IDs (`ENG-NNN`) in the commits since the last tag that change
     the package: `git log <last tag>..<release commit> -- packages/<package>`.
   - Ticket IDs in the titles and descriptions of those commits' PRs.
     `CSR-0` means "no ticket".
   - A ticket named only in a PR description, or only for context ("as in
     ENG-1680"), is not attached until the operator confirms it.

   Attach each one: `save_issue({ id, addReleases: [<release id>] })`. If a
   ticket is on the pipeline's started release, also remove it there with
   `removeReleases`.

4. Settle each ticket before the publish. Completing the release marks every
   attached ticket Done. A ticket with more work to come, for example more PRs or
   a customer reply, moves to the started release: `save_issue({ id, addReleases:
[<started release id>], removeReleases: [<this release id>] })`. Ask the
   operator which tickets have more work to come.

5. Write the release notes. Check
   `list_release_notes({ pipeline: <slug>, release: <release id> })` first
   and update the note if one exists.

   ```
   save_release_note({
     pipeline: <slug>,
     releases: [<release id>],
     title: '@currents/<package> <version>',
     content: <the Linear release notes below>
   })
   ```

   You don't need the operator's approval for the note, but it must follow
   the structure in "Release notes structure" below.

## 7. Notion release page

Package releases have a page in the Releases database, the same database as
the platform releases: data source
`collection://197be2b5-c1d5-80fb-90e2-000bdd6ed896`. The page is named
`@currents/<package>@<version>`, for example `@currents/cmd@1.9.9`. Skip this
step for `@currents/rules` and for every channel except `latest`.

Check that no page has the name, with `notion-search` on that data source.
Match the title exactly. Then create the page with `notion-create-pages`:

| Property     | Value                                                  |
| ------------ | ------------------------------------------------------ |
| Name         | `@currents/<package>@<version>`                        |
| Release Date | today                                                  |
| Diff Link    | the compare URL from the CHANGELOG heading             |
| Services     | `@currents/<package>`                                  |
| Released by  | the operator                                           |
| Impact       | `Major Changes`, `Fixes`, or `Fixes and Small Changes` |

The content follows the Notion page structure in "Release notes structure"
below. You don't need the operator's approval for the page. Keep the page URL
for the Slack messages.

## 8. Announce the release in Slack

Channel: `#releases` (`C075P0RFGAW`). Draft the message, show it to the
operator, and post it with `slack_send_message` only after they approve. Use
Slack formatting: `*bold*`, `<url|label>` links and `•` bullets. Markdown
links do not render.

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

Leave out a heading that has nothing under it. For channels other than
`latest`, leave out
the Notion and Linear links. Keep the message's `ts` for step 10: it is the
`p<digits>` part of the permalink, with a decimal point before the last six
digits (`p1787270016651819` → `1787270016.651819`).

## 9. Merge and publish

When the PR is approved and CI passes, merge it with a merge commit:
`gh pr merge <n> --merge`. Then give the operator the publish command, with
the base branch as the ref:

```bash
gh workflow run publish.yaml --ref <base branch> \
  -f package=@currents/<package> -f channel=<channel>
```

## 10. Check the published package and complete

- Watch the publish run to the end: `gh run watch <run id> --exit-status`.
  For `latest`, the steps "Mark Linear release as complete" and "Post to
  Slack" must pass. The second one posts its own short message to
  `#releases`.
- `npm view @currents/<package> dist-tags` shows the new version on the
  channel. `npm view @currents/<package>@<version> dist.attestations` shows
  the provenance.
- Install the version from npm in an empty folder and repeat the checks from
  step 3.
- For `latest`: `get_release` shows the stage `Released`, and the tickets
  from step 6 are Done, except the ones you moved.
- For `latest`: set `Production deployed & tested` on the Notion page from
  step 7, and tick "Notify team about the release" when the reply below is
  posted.

Then reply to the announcement from step 8. Show the draft first, as before.

```
slack_send_message({
  channel_id: 'C075P0RFGAW',
  thread_ts: <ts from step 8>,
  reply_broadcast: true,
  message: ...
})
```

```text
*@currents/<package> <version>* is on npm `<channel>`.

Checked from npm: <one line per check from step 3>

Still open, moved to the next release:
• ENG-NNN: <why>

<npm url|npm> · <Notion page url|Release document> · <Linear release url|Release notes>
```

Leave out "Still open" when no ticket moved. For channels other than
`latest`, leave out "Still open" and the Notion and Linear links, because
steps 6 and 7 made no release or page, and post the reply without
`reply_broadcast`.

If the published version is broken, give the operator the commands to move
the channel back and mark the version, and post in the thread what happened:

```bash
npm dist-tag add @currents/<package>@<previous version> <channel>
npm deprecate @currents/<package>@<version> "<what is broken>; use <previous version>"
```

Do not unpublish: lockfiles that already have the version stop installing.

## Report

End with a table of the steps — release commit, PR, tag, GitHub release,
Linear release, Notion page, Slack announcement, merge, publish run, npm dist-
tag, check from npm, Slack reply — each linked to its PR, run, release,
message or npm page, with the evidence you checked.

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
  link. Only entries that change the package (step 2).
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

Notion page. Copy the checklist from the page of the previous version of the
package, as it is:

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

<the checklist>

### Public Changelog Items to Publish

- <one bullet per change that users of the package notice>
```

After you write either one, read it back (`get_release` with release notes,
or `notion-fetch`) and check that the headings are there, in this order, and
that no heading is empty.
