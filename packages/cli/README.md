# @currents/cmd

CLI tools for [Currents](https://currents.dev) - a cloud platform for debugging, troubleshooting, and analyzing parallel CI tests.

## Installation

```sh
npm install @currents/cmd --save-dev
```

## Usage

Run the CLI command:

```sh
npx currents upload --project-id=xxx --key=yyy
```

The command will:

1. Read the configuration.

   The report directory is determined from `process.env.CURRENTS_REPORT_DIR` or `--reportDir`, or the most recently created directory named using the pattern `.currents-report-[timestamp]-[uuidv4()]` in the current working directory.

   The report directory contains test results grouped by spec file and the configuration information used to obtain them.

2. Optionally run a full test suite "discovery" process, which will try to find all tests (required for the Currents platform).

   The full test suite includes the tests that should be part of the same run but executed across different machines.

3. Upload the test results to the Currents

   The `--project-id` and [--key](https://docs.currents.dev/guides/record-key) are used to identify the project and associate the results with the organization in the Currents dashboard.

## Configuration

Please note that all options apart from `--project-id` and `--key` are optional.

| Property               | Type      | Description                                                                                                                                                  | Environment variable          | Default                                 |
| ---------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------- | --------------------------------------- |
| `-k, --key`            | `string`  | The record key to be used to record the results on the remote dashboard. Read more: https://currents.dev/readme/guides/record-key                            | `CURRENTS_RECORD_KEY`         | -                                       |
| `-p, --project-id`     | `string`  | The id of the project to record the test run.                                                                                                                | `CURRENTS_PROJECT_ID`         | -                                       |
| `--machine-id`         | `string`  | Unique identifier of the machine running the tests. If not provided, it will be generated automatically. See: https://currents.dev/readme/readme?q=machineId | `CURRENTS_MACHINE_ID`         | `[random-string]`                       |
| `--report-dir`         | `string`  | The path from where the CLI command will read the Currents report                                                                                            | `CURRENTS_REPORT_DIR`         | `.currents-report-[timestamp]-[uuidv4]` |
| `--ci-build-id`        | `string`  | The id of the build to record the test run. Read more: https://currents.dev/readme/guides/ci-build-id                                                        | `CURRENTS_CI_BUILD_ID`        | `auto:[random-string]`                  |
| `--debug`              | `boolean` | Enable debug logs                                                                                                                                            | `DEBUG="currents,currents:*"` | `falseu`                                |
| `-t, --tag`            | `string`  | Comma-separated tag(s) for recorded runs in Currents                                                                                                         | `CURRENTS_TAG`                | -                                       |
| `--disable-title-tags` | `boolean` | Disable extracting tags from test title, e.g. `Test name @smoke` would not be tagged with `smoke`                                                            | `CURRENTS_DISABLE_TITLE_TAGS` | `false`                                 |
| `--remove-title-tags`  | `boolean` | Remove tags from test names in Currents, e.g. `Test name @smoke` becomes `Test name` in the dashboard                                                        | `CURRENTS_REMOVE_TITLE_TAGS`  | `false`                                 |

The configuration is also available by running the CLI command with the `--help` argument.

**Note:**

The `CI Build ID` and `Machine ID` will be generated automatically if not set. It is **important** to set the `CI Build ID` explicitly when the results from different machines are part of the same test run. Read more - [here](https://docs.currents.dev/guides/ci-build-id).

## Troubleshooting

Run the CLI command with the `--debug` argument or prefix it with `DEBUG="currents,currents:*"` to obtain detailed information about the command execution process.
