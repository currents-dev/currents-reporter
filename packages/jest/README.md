# @currents/jest

A [Jest](https://github.com/facebook/jest) reporter for [Currents](https://currents.dev) - a cloud platform for debugging, troubleshooting and analysing CI test results.

## Setup

```sh
npm install @currents/jest --save-dev
```

## Usage

Add the reporter to Jest configuration:

```ts
import type { Config } from "jest";

const config: Config = {
  reporters: ["default", ["@currents/jest"]],
};

export default config;
```

or set the `--reporters` option when running the Jest CLI

```sh
npx jest --reporters=@currents/jest
```

When the Jest command is executed in the terminal, a folder named using the pattern ".currents-report-[timestamp]-[uuidv4()]" will be created in your root directory. This folder will contain information about your tests and the configuration used to generate it.

## Configuration

| Property    | Type     | Description                                               | Environment variable  | Default                                 |
| ----------- | -------- | --------------------------------------------------------- | --------------------- | --------------------------------------- |
| `reportDir` | `STRING` | The path where the plugin will output the Currents report | `CURRENTS_REPORT_DIR` | ".currents-report-[timestamp]-[uuidv4]" |

## Troubleshooting

Set `DEBUG=currents-jest` before running the tests to obtain detailed information about the reporter execution process.
