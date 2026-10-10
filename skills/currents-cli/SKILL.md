---
name: currents-cli
description: Run the Currents CLI (the `currents` command of the npm package @currents/cmd). Use when asked to upload test results to Currents, convert JUnit or other test reports to the Currents format, attach files or logs to a CI run, cancel a Currents run when CI is cancelled, record a browser session and share it as evidence, cache the last run so a CI rerun runs only the failed tests, or call a Currents REST API route from the command line. Also use when adding these steps to GitHub Actions or GitLab CI.
---

# Currents CLI

`currents` is the command of the npm package `@currents/cmd`. In a project that has the package, run `npx currents`. Elsewhere, run `npx --package @currents/cmd currents`: `npx currents` alone runs an unrelated npm package.

## Pick the command

- `currents run upload`: upload the results of a Currents reporter (Jest, Node test runner, Detox). With `--input-format junit`, upload JUnit XML.
- `currents run attach`: attach logs or other files to a run that CI recorded.
- `currents run cancel`: cancel a run when its CI workflow is cancelled.
- `currents run get`: get the data of a run.
- `currents session start`, then `session attach` and `session share`: record a browser session and share a link to it.
- `currents cache set` and `cache get` with `--preset last-run`: rerun only the failed Playwright tests in a CI rerun. With `--id`: save files in one CI job and restore them in another.
- `currents api <path>`: call any other REST API route.

`@currents/playwright` and the Cypress integration send results themselves. Do not add `currents run upload` after them.

Before you use a command, run `currents <command> --help` for its options and examples, and do not use an option it does not list. For CI steps run `currents docs ci-setup`, and for the session flow run `currents docs sessions`.

## Credentials

- Record key, in `CURRENTS_RECORD_KEY` or `--key`: `run upload`, `run cancel`, `cache`.
- API key, in `CURRENTS_API_KEY` or `--api-key`: `run get`, `api`.
- `run attach` and `session` take either key. The record key wins when both are set.

Both keys come from the Currents dashboard. Set them as environment variables or CI secrets, not as options.

## Safety

- Never print, log or commit a key, and do not put one in a command you show to the user. Write `<record-key>` or name the environment variable.
- Do not commit `.currents-session/`, which `session start` writes.
- Anyone with a share link can open what you attach. Attach only test data and files from development accounts.
- `run attach` and `session attach` refuse `.env` files and skip hidden files. Do not rename or copy files to get around this.

## Exit codes and errors

- `0` when the command finished, `1` otherwise. Errors go to stderr, prefixed with `ERROR`.
- A 401 or 403 usually means the wrong key: a record key where an API key is needed, an API key without write access, or a key of another organization.
- Run the command again with `--debug` to see the requests. Keys are hidden in it.
- Do not retry a failed command in a loop. Report the error and what you tried.
