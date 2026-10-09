# Sessions

A session holds the files of an ad-hoc, one-off agent or browser session, such as screenshots, a Playwright MCP trace and logs, and gives a link to share them. Use it as evidence: a bug before and after a fix, or proof that something works.

The session commands need an API key with write access, in `CURRENTS_API_KEY` or `--api-key`.

## Flow

These are the commands from `currents session --help`:

```bash
currents session start --api-key <api-key> --project-id <id> --title "Checkout fails on empty cart" --status failed
currents session attach before.png .playwright-mcp/traces
currents session attach test-results
currents session share --expires-in-days 7
```

### 1. Start

`session start` creates the session and saves its ID to `.currents-session/session.json` in the current folder. It also writes `.currents-session/.gitignore`, so git ignores the folder.

- `--title` is required. Say what the session shows.
- `--status` is `passed` (the default) or `failed`. Add `--error` with what went wrong for a failed session.
- `--pr` takes the URL or the number of the pull request. Without it, the pull request comes from the CI environment, if there is one.
- The commit and branch come from the git repository in the current folder. Outside a repository the session has none.

`attach` and `share` use the saved session. Run them in the same folder, or pass `--session-id` (or set `CURRENTS_SESSION_ID`). A new `session start` replaces the saved session, so share a session before you start the next one.

### 2. Attach

`session attach` takes files and folders:

- A file is uploaded as it is. Its type comes from its name: `.png`, `.jpg`, `.jpeg`, `.webp` and `.gif` are screenshots, `.webm` and `.mp4` are videos, and a `.zip` made by Playwright, such as a Playwright Test `trace.zip`, is a trace. Anything else is an attachment. `--type` sets the type.
- A folder adds every file under it, subfolders included. Each file is named by its path in the folder, such as `login-chromium/trace.zip`, so a Playwright `test-results` folder attaches in one command. Hidden files and folders, links and empty files are skipped, with a warning.
- A folder that holds `trace-*.trace` files, the one you pass or one inside it, is packed into one trace zip, and nothing else in it is attached. This is how the Playwright MCP output folder is attached.
- A session takes at most 200 files. A folder with more fails before anything is uploaded; pass the subfolders you need instead.
- A file named `.env` or `.env.*` is refused, and the command fails. So is an empty file named on the command line, and a file larger than 1 GiB.
- `--caption` adds a short description to each file, and `--meta key=value` adds a label (repeat it for more labels).

What to attach:

- a screenshot of the state you want to show;
- the Playwright MCP trace folder (`.playwright-mcp/traces` unless the server runs with `--output-dir`). Empty it before each capture: `attach` packs every trace in it;
- the accessibility snapshot of the page, saved as a text file;
- console or server logs, if they show the problem.

Do not attach files with keys, passwords or data of real users. Anyone with the share link can open the files.

### 3. Share

`session share` creates a public link to the session page. `--expires-in-days` takes `1`, `3` or `7`, and is `7` by default.

A person opens the page. An agent reads the Markdown version, which says what the page did and what failed:

```bash
curl -sL "<markdown url>"
```

## What each command prints

| Command                | Output on stdout                                                                                            |
| ---------------------- | ----------------------------------------------------------------------------------------------------------- |
| `session start`        | `Session started: <session-id>`                                                                             |
| `session start --json` | `{"sessionId":"<session-id>"}` only; other messages go to stderr                                            |
| `session attach`       | `Attached <file> (<type>)` for each file, and `Failed <file>: <reason>` on stderr for each file that failed |
| `session share`        | the page URL on the first line, then `Markdown: <markdown url>`                                             |

- `session attach` and `session share` have no `--json`. To use the links in a script, read the first line of `session share` for the page URL, and the line that starts with `Markdown: ` for the Markdown URL.

## Errors

- `No session found`: `session start` did not run in this folder. Run it here, or pass `--session-id`.
- 401 or 403 from `session start`: `CURRENTS_API_KEY` is missing, or the key has no write access.
- 404 from `session start`: the project ID does not belong to the organization of the key.
- 403 from `session share`: the organization turned public sharing off. Report the files you have without a link.
- `<n> of <m> files could not be uploaded`: the other files were attached. Attach only the failed files again.
