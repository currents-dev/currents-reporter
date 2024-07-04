# @currents/reporter-cli

A CLI tool designed to process and upload test results to [Currents](https://currents.dev), a cloud dashboard for debugging, troubleshooting, and analyzing parallel CI tests.

## Installation

```
$ npm install @currents/reporter-cli --save-dev
```

## Usage

Run the CLI command:

```
$ npx currents-reporter --project-id=xxx --key=yyy
```

The CLI command will:

1. Read the configuration.

   The report directory is determined from `process.env.CURRENTS_REPORT_DIR`, `--reportDir`, or the most recent directory named using the pattern ".currents-report-[timestamp]-[uuidv4()]" in the current working directory.

   The report directory contains test results grouped by spec file and the configuration information used to obtain them.

2. Optionally run a full test suite "discovery" process, which will try to find all tests (required for the Currents dashboard).

   The full test suite includes the tests that should be part of the same run but executed across different machines.

3. Upload the test results to the Currents dashboard.

   The `--project-id` and [--key](https://docs.currents.dev/guides/record-key) are used to identify the project and associate the results with the organization in the Currents dashboard.

## Configuration

Please note that all options apart from `--project-id` and `--key` are optional. 

| Property           | Type      | Description                                                                                                                                                  | Environment variable          | Default                                 |
| ------------------ | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------- | --------------------------------------- |
| `-k, --key`        | `STRING`  | The record key to be used to record the results on the remote dashboard. Read more: https://currents.dev/readme/guides/record-key                            | `CURRENTS_RECORD_KEY`         | -                                       |
| `-p, --project-id` | `STRING`  | The id of the project to record the test run.                                                                                                                | `CURRENTS_PROJECT_ID`         | -                                       |
| `--machine-id`     | `STRING`  | Unique identifier of the machine running the tests. If not provided, it will be generated automatically. See: https://currents.dev/readme/readme?q=machineId | `CURRENTS_MACHINE_ID`         | -                                       |
| `--report-dir`     | `STRING`  | The path from where the CLI command will read the Currents report                                                                                            | `CURRENTS_REPORT_DIR`         | ".currents-report-[timestamp]-[uuidv4]" |
| `--ci-build-id`    | `STRING`  | The id of the build to record the test run. Read more: https://currents.dev/readme/guides/ci-build-id                                                        | `CURRENTS_CI_BUILD_ID`        | -                                       |
| `--debug`          | `BOOLEAN` | Enable debug logs                                                                                                                                            | `DEBUG="currents,currents:*"` | -                                       |

The configuration is also available by running the CLI command with the `--help` argument.

**Note:**

The `CI Build ID` and `Machine ID` will be generated automatically if not set. It is **important** to set the `CI Build ID` explicitly when the results from different machines are part of the same test run. Read more - [here](https://currents.dev/readme/guides/ci-build-id).

## Troubleshooting

Run the CLI command with the `--debug` argument or prefix it with `DEBUG="currents,currents:*"` to obtain detailed information about the command execution process.
