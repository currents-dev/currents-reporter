# @currents/node-test-reporter

A [Node.js](https://nodejs.org/) test reporter for [Currents](https://currents.dev), a cloud platform for CI test analysis, debugging, troubleshooting, and analyzing CI test results:

- Save NodeJS test results to a cloud
- Fetch git information and associate with CI builds
- Integrate with your workflow - Slack, GitHub or GitLab PR comments and status checks
- Flakiness, failure rate, duration and much more aggregative metrics
- Errors and root cause tracker
- Automated reports with test suite health metrics
- Get access to test results via REST API and HTTP webhooks

## Requirements
- NodeJS 18.20.4+

## Setup

```shell
npm i -D @currents/node-test-reporter
```

## Usage

Run your tests with the following commands to generate reports:
```sh
node --test --test-reporter @currents/node-test-reporter --test-reporter-destination report.xml
```

You can also use this with other reporters to generate multiple outputs, such as detailed logs for debugging and summary reports for CI pipelines.

```sh
node --test --test-reporter @currents/node-test-reporter --test-reporter-destination report.xml --test-reporter spec --test-reporter-destination stdout
```
