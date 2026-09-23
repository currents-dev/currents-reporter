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

The reporter saves the test results in a folder named using the pattern `.currents/[timestamp]-[uuidv4()]` in the root directory. You can override this with the `reportDir` option or the `CURRENTS_REPORT_DIR` environment variable (env takes precedence). We recommend adding `.currents*` to your `.gitignore` file.

## Configuration

| Property    | Type     | Description            | Environment variable  | Default                            |
| ----------- | -------- | ---------------------- | --------------------- | ---------------------------------- |
| `reportDir` | `string` | Test results directory | `CURRENTS_REPORT_DIR` | `.currents/[timestamp]-[uuidv4()]` |

`CURRENTS_REPORT_DIR` overrides `reportDir` when both are set.

## Detox

Add the reporter next to the Detox reporter:

```js
// jest.config.js
module.exports = {
  // ...
  reporters: ['detox/runners/jest/reporter', '@currents/jest'],
};
```

Then run `detox test` and `currents upload` from [@currents/cmd](https://www.npmjs.com/package/@currents/cmd):

```sh
npx detox test --configuration android.emu.release --retries 1 \
  --record-videos failing --take-screenshots failing --record-logs all
npx currents upload --project-id=xxx --key=yyy
```

When the reporter runs under Detox:

- Every Jest process of one `detox test` writes to `.currents/<session>`, named after the Detox artifacts directory. `reportDir` and `CURRENTS_REPORT_DIR` still take precedence.
- The attempts of a `detox test --retries` rerun are added to the attempts of the earlier run. A test that fails on the first run and passes on the rerun shows both attempts and is marked flaky.
- `currents upload` attaches the videos, screenshots and logs that Detox recorded to the attempt they belong to, turns the element actions of `detox.trace.json` into steps, and uploads `detox.trace.json` itself. Detox writes `detox.trace.json` when logs are recorded (`--record-logs`).

## Troubleshooting

Set `DEBUG=currents-jest` before running the tests to obtain detailed information about the reporter execution process.
