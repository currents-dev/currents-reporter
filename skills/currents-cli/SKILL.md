---
name: currents-cli
description: Run the Currents CLI (the `currents` command of the npm package @currents/cmd). Use when asked to upload test results to Currents, convert JUnit or other test reports to the Currents format, attach files or logs to a CI run, cancel a Currents run when CI is cancelled, record a browser session and share it as evidence, or cache the last run so a CI rerun runs only the failed tests. Also use when adding these steps to GitHub Actions or GitLab CI.
---

# Currents CLI

`currents` sends test results and files to Currents. It is the command of the npm package `@currents/cmd`.

## Install

```bash
npm install --save-dev @currents/cmd
```

In the project, run it as `npx currents`. Outside a project, use `npx --package @currents/cmd currents`: without the package installed, `npx currents` runs an unrelated npm package named `currents`.

## Pick the command

| Task                                                                         | Command                                                       |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Upload the results a Currents reporter wrote (Jest, Node test runner, Detox) | `currents upload`                                             |
| Report JUnit XML results                                                     | `currents convert`, then `currents upload`                    |
| Attach logs or other files to a run that CI recorded                         | `currents run attach`                                         |
| Cancel a run when its CI workflow is cancelled                               | `currents run cancel`                                         |
| Record a browser session and share a link to it                              | `currents session start`, `session attach`, `session share`   |
| Save the last run so that a CI rerun runs only the failed Playwright tests   | `currents cache set` and `cache get` with `--preset last-run` |
| Save files in one CI job and restore them in another                         | `currents cache set` and `cache get` with `--id`              |
| Get the data of a run                                                        | `currents api get-run`                                        |

`@currents/playwright` and the Cypress integration send results themselves. Do not add `currents upload` after them.

Run `currents <command> --help` for the options and more examples of a command. The help is the reference: do not guess an option that it does not list.

## Examples

These are the examples from `--help`:

```bash
currents upload --key <record-key> --project-id <id> --ci-build-id <build-id>
currents convert --input-format junit --input-file "./*.xml" --framework postman
currents run attach --key <record-key> --project-id <id> --ci-build-id <build-id> --machine-id shard-1 docker-logs.zip
currents run attach --key <record-key> --project-id <id> --ci-build-id <build-id> --spec tests/cart.spec.ts --test-title "adds an item" screenshot.png
currents run cancel --key <record-key> --project-id <id> --ci-build-id <build-id>
currents cache set --key <record-key> --preset last-run
currents cache get --key <record-key> --preset last-run
currents api get-run --api-key <api-key> --ci-build-id <ci-build-id>
```

- `convert` writes the results to a new folder in `.currents/`, and `upload` uploads the newest folder there. Put quotes around the `--input-file` pattern so that the CLI expands it, not the shell.
- `run attach` needs `--machine-id` for files of the whole run, or `--spec` (and `--test-title`) for files of a spec file or a test.

## Credentials

Each command takes one kind of key. Both come from the Currents dashboard.

| Command                                            | Key                                                 | Option               | Environment variable                      |
| -------------------------------------------------- | --------------------------------------------------- | -------------------- | ----------------------------------------- |
| `upload`, `run cancel`, `cache set`, `cache get`   | record key                                          | `--key`              | `CURRENTS_RECORD_KEY`                     |
| `run attach`                                       | record key, or an API key when no record key is set | `--key`, `--api-key` | `CURRENTS_RECORD_KEY`, `CURRENTS_API_KEY` |
| `session start`, `session attach`, `session share` | API key with write access                           | `--api-key`          | `CURRENTS_API_KEY`                        |
| `api get-run`                                      | API key                                             | `--api-key`          | `CURRENTS_API_KEY`                        |

Other environment variables the commands read:

- `CURRENTS_PROJECT_ID`: `upload`, `run attach`, `run cancel`, `session start`, `api get-run`
- `CURRENTS_CI_BUILD_ID`: `upload`, `run attach`, `run cancel`. `api get-run` takes `--ci-build-id` only as an option
- `CURRENTS_RUN_ID`: `run cancel`
- `CURRENTS_MACHINE_ID`: `upload`, `run attach`
- `CURRENTS_SESSION_ID`: `session attach`, `session share`
- `CURRENTS_REPORT_DIR`: `upload`
- `CURRENTS_DEBUG`: all commands, same as `--debug`

Set keys as environment variables or CI secrets, not as options, so that they stay out of shell history and CI logs. In CI, set `CURRENTS_CI_BUILD_ID` once for the job, so that the reporter, `run attach` and `run cancel` find the same run. `run cancel` does not find the CI build ID by itself: it needs `--ci-build-id` or `--run-id`.

## Exit codes

- `0`: the command finished. It is also `0` when `run cancel` finds no run to cancel, when `cache get --continue` finds no cache, and when `cache set --continue` finds no files to save.
- `1`: anything else. For example a missing option, an option value the command does not take, an API error, or a file that could not be uploaded. `currents` without a command prints the help and exits with `1`.

Errors go to stderr, prefixed with `ERROR`. Other output goes to stdout.

When a command fails:

1. Read the message. For a missing value it names the option and the environment variable to set.
2. A 401 or 403 from the API usually means the wrong key: a record key where an API key is needed, an API key without write access, or a key of another organization.
3. Run the command again with `--debug` to see the requests and the resolved configuration. The debug output of `cache get` includes the record key, so do not share debug output without removing keys from it.
4. `run attach` and `session attach` print `Attached <file>` for each file that arrived and `Failed <file>` for each that did not. Attach only the failed files again.
5. Do not retry a failed command in a loop. Report the error and what you tried.

## Safety

- Never print, echo, log or commit a record key or an API key, and do not put a key in a command you show to the user. Write `<record-key>` or refer to the environment variable.
- `session start` writes `.currents-session/session.json` and a `.gitignore` that keeps the folder out of git. Do not commit the folder and do not delete that `.gitignore`.
- Anyone with a session share link can open what you attach. Attach only test data and files from development accounts.
- `run attach` and `session attach` refuse files named `.env` or `.env.*`. In a folder you pass, they skip hidden files, links and subfolders. Do not rename or copy files to get around this.

## References

- [references/ci-setup.md](references/ci-setup.md): GitHub Actions and GitLab CI steps for `upload`, `run attach`, `run cancel` and rerunning failed tests with `cache`.
- [references/sessions.md](references/sessions.md): the `session start`, `attach`, `share` flow, what to attach and what each command prints.
