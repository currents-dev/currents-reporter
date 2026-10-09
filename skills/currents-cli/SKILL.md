---
name: currents-cli
description: Run the Currents CLI (the `currents` command of the npm package @currents/cmd). Use when asked to upload test results to Currents, convert JUnit or other test reports to the Currents format, attach files or logs to a CI run, cancel a Currents run when CI is cancelled, record a browser session and share it as evidence, cache the last run so a CI rerun runs only the failed tests, or call a Currents REST API route from the command line. Also use when adding these steps to GitHub Actions or GitLab CI.
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
| Upload the results a Currents reporter wrote (Jest, Node test runner, Detox) | `currents run upload`                                         |
| Report JUnit XML results                                                     | `currents run upload --input-format junit`                    |
| Attach logs or other files to a run that CI recorded                         | `currents run attach`                                         |
| Cancel a run when its CI workflow is cancelled                               | `currents run cancel`                                         |
| Record a browser session and share a link to it                              | `currents session start`, `session attach`, `session share`   |
| Save the last run so that a CI rerun runs only the failed Playwright tests   | `currents cache set` and `cache get` with `--preset last-run` |
| Save files in one CI job and restore them in another                         | `currents cache set` and `cache get` with `--id`              |
| Get the data of a run                                                        | `currents run get`                                            |
| Call any other REST API route, such as listing runs or cancelling a run      | `currents api <path>`                                         |

`@currents/playwright` and the Cypress integration send results themselves. Do not add `currents run upload` after them.

Run `currents <command> --help` for the options and more examples of a command. The help is the reference: do not guess an option that it does not list.

## Examples

These are the examples from `--help`:

```bash
currents run upload --key <record-key> --project-id <id> --ci-build-id <build-id>
currents run upload --key <record-key> --project-id <id> --ci-build-id <build-id> --input-format junit --input-file "./*.xml" --framework postman
currents run attach --key <record-key> --project-id <id> --ci-build-id <build-id> --machine-id shard-1 docker-logs.zip
currents run attach --key <record-key> --project-id <id> --ci-build-id <build-id> --spec tests/cart.spec.ts --test-title "adds an item" --attempt 0 screenshot.png
currents run cancel --key <record-key> --project-id <id> --ci-build-id <build-id>
currents cache set --key <record-key> --preset last-run
currents cache get --key <record-key> --preset last-run
currents run get --api-key <api-key> --project-id <project-id> --ci-build-id <ci-build-id>
```

- With `--input-format`, `run upload` converts the reports to the Currents format first, then uploads them. Put quotes around the `--input-file` pattern so that the CLI expands it, not the shell: the shell passes only the first file.
- Without `--id`, `cache set` and `cache get` use an ID made from the CI job. When they warn `No CI job detected`, pass the same `--id` to both.
- Without `--spec`, `run attach` attaches the files to the whole run. `--machine-id` names the CI machine the files come from; run-level files are listed by machine when it is set. `--spec`, `--test-title` and `--attempt` attach to a spec file, a test or one attempt of a test (the first attempt is `0`).

## Call the REST API

`currents api <path>` sends a request to any route of the Currents REST API with the API key and prints the response body. Use it when no other command does the task. The routes are in the REST API docs: https://docs.currents.dev/resources/api/api-resources

```bash
currents api /v1/runs/<run-id>
currents api /v1/projects/<project-id>/runs -X GET -f "branches[]=main" -f status=FAILED
currents api /v1/runs/<run-id>/cancel -X PUT
```

- The path can start with `/v1/`, `v1/` or the route name.
- `-f key=value` adds a field; `true`, `false`, `null` and numbers are sent as JSON values. `-F key=value` adds a field that is always a string.
- Without `-X`, fields make the request a POST with the fields in a JSON body. A GET sends them in the query string, so pass `-X GET` with fields.
- `--input <file>` sends the file as the body; the fields then go in the query string, whatever the method.
- A response that is not 2xx prints its body on stderr and exits with `1`.

## Credentials

Each command takes one kind of key. Both come from the Currents dashboard.

| Command                                              | Key                                                 | Option               | Environment variable                      |
| ---------------------------------------------------- | --------------------------------------------------- | -------------------- | ----------------------------------------- |
| `run upload`, `run cancel`, `cache set`, `cache get` | record key                                          | `--key`              | `CURRENTS_RECORD_KEY`                     |
| `run attach`                                         | record key, or an API key when no record key is set | `--key`, `--api-key` | `CURRENTS_RECORD_KEY`, `CURRENTS_API_KEY` |
| `session start`, `session attach`, `session share`   | record key, or an API key when no record key is set | `--key`, `--api-key` | `CURRENTS_RECORD_KEY`, `CURRENTS_API_KEY` |
| `run get`, `api`                                     | API key                                             | `--api-key`          | `CURRENTS_API_KEY`                        |

Other environment variables the commands read:

- `CURRENTS_PROJECT_ID`: `run upload`, `run attach`, `run cancel`, `session start`, `run get`
- `CURRENTS_CI_BUILD_ID`: `run upload`, `run attach`, `run cancel`, `run get`. `run get` ignores it when `--branch` or `--tag` is set
- `CURRENTS_RUN_ID`: `run cancel`
- `CURRENTS_MACHINE_ID`: `run upload`, `run attach`
- `CURRENTS_SESSION_ID`: `session attach`, `session share`
- `CURRENTS_REPORT_DIR`: `run upload`
- `CURRENTS_TAG`: `run upload`, comma-separated tags for the run
- `CURRENTS_REMOVE_TITLE_TAGS`, `CURRENTS_DISABLE_TITLE_TAGS`: `run upload`, same as `--remove-title-tags` and `--disable-title-tags`
- `CURRENTS_PREVIOUS_CI_BUILD_ID`: `run upload`, the CI build ID of the earlier attempt of this CI build, sent with the run
- `CURRENTS_OUTPUT`: `run get`, same as `--output`
- `CURRENTS_DEBUG`: all commands, same as `--debug`
- `CURRENTS_API_URL`: the Currents API address for `run upload`, `run cancel` and `cache`. `CURRENTS_REST_API_URL`: the REST API address for `run attach`, `run get`, `session` and `api`. Set them only to reach a server other than Currents, such as a local test server

An option on the command line wins over its environment variable, and the environment variable wins over the default. For a flag such as `CURRENTS_DEBUG`, `false`, `0`, `no` and `off` turn it off, and any other value turns it on.

Set keys as environment variables or CI secrets, not as options, so that they stay out of shell history and CI logs. In CI, set `CURRENTS_CI_BUILD_ID` once for the job, so that the reporter, `run attach` and `run cancel` find the same run. `run cancel` does not find the CI build ID by itself: it needs `--ci-build-id` or `--run-id`.

## Exit codes

- `0`: the command finished. It is also `0` when `run cancel` finds no run to cancel, when `cache get --continue` finds no cache, and when `cache set --continue` finds no files to save.
- `1`: anything else. For example a missing option, an option value the command does not take, an API error, or a file that could not be uploaded. `currents` without a command prints the help and exits with `1`.

Errors go to stderr, prefixed with `ERROR`. Other output goes to stdout, except for `run get` without `--output`, `session start --json` and `api`: they print only the response or JSON on stdout, and everything else on stderr.

When a command fails:

1. Read the message. For a missing value it names the option and the environment variable to set.
2. A 401 or 403 from the API usually means the wrong key: a record key where an API key is needed, an API key without write access, or a key of another organization.
3. Run the command again with `--debug` to see the requests and the resolved configuration. Keys are replaced with `*****` in it.
4. `run attach` and `session attach` print `Attached <file>` for each file that arrived and `Failed <file>` for each that did not. Attach only the failed files again.
5. Do not retry a failed command in a loop. Report the error and what you tried.

## Safety

- Never print, echo, log or commit a record key or an API key, and do not put a key in a command you show to the user. Write `<record-key>` or refer to the environment variable.
- `session start` writes `.currents-session/session.json` and a `.gitignore` that keeps the folder out of git. Do not commit the folder and do not delete that `.gitignore`.
- Anyone with a session share link can open what you attach. Attach only test data and files from development accounts.
- `run attach` and `session attach` refuse files named `.env` or `.env.*`. In a folder you pass, they skip hidden files and folders, and links. Do not rename or copy files to get around this.

## References

- [references/ci-setup.md](references/ci-setup.md): GitHub Actions and GitLab CI steps for `run upload`, `run attach`, `run cancel` and rerunning failed tests with `cache`.
- [references/sessions.md](references/sessions.md): the `session start`, `attach`, `share` flow, what to attach and what each command prints.
