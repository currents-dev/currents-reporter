# @currents/jest

A [Jest](https://github.com/facebook/jest) reporter for [Currents](https://currents.dev) - a cloud platform for debugging, troubleshooting and analysing CI test results:

- Save jest test results to a cloud
- Fetch git information and associated with CI builds
- Integrate with your workflow - Slack, GitHub or GitLab PR comments and status checks
- Flakiness, failure rate, duration and much more aggregative metrics
- Errors and root cause tracker
- Automated reports with test suite health metrics
- Get access to test results via REST API and HTTP webhooks

## Requirements

- Jest version 29.5.0+
- NodeJS 18.20.4+

## Setup

```sh
npm install @currents/jest --save-dev
```

## Usage

Add the reporter to Jest configuration:

```ts
import type { Config } from 'jest';

const config: Config = {
  reporters: ['default', ['@currents/jest']],
};

export default config;
```

or set the `--reporters` option when running the `jest`

```sh
npx jest --reporters=@currents/jest
```

The reporter saves the test results in a folder named using the pattern `.currents/[timestamp]-[uuidv4()]` in the root directory. We recomment to add `.currents*` to your `.gitignore` file.

## Configuration

| Property    | Type     | Description            | Environment variable  | Default                          |
| ----------- | -------- | ---------------------- | --------------------- | -------------------------------- |
| `reportDir` | `string` | Test results directory | `CURRENTS_REPORT_DIR` | `.currents/[timestamp]-[uuidv4]` |

## Troubleshooting

Set `DEBUG=currents-jest` before running the tests to obtain detailed information about the reporter execution process.
