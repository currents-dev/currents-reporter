# @currents/jest-reporter

A [Jest](https://github.com/facebook/jest) test results processor for generating reports for [Currents](https://currents.dev) - a cloud dashboard for debugging, troubleshooting and analysing parallel CI tests.

## Installation

```
$ npm install @currents/jest-reporter --save-dev
```

## Usage

Add the reporter to the Jest configuration:

```JSON
"reporters": [
	"default",
	["@currents/jest-reporter", {}]
]
```

or set the `--reporters` option when running the Jest CLI

```
$ npx jest --reporters=@currents/jest-reporter
```

When the Jest command is executed in the terminal, a folder named using the pattern ".currents-report-[timestamp]-[uuidv4()]" will be created in your root directory. This folder will contain information about your tests and the configuration used to generate it.

## Configuration

| Property    | Type     | Description                                               | Environment variable  | Default                                 |
| ----------- | -------- | --------------------------------------------------------- | --------------------- | --------------------------------------- |
| `reportDir` | `STRING` | The path where the plugin will output the Currents report | `CURRENTS_REPORT_DIR` | ".currents-report-[timestamp]-[uuidv4]" |

## Troubleshooting

Set `DEBUG=currents-jest` before running the tests to obtain detailed information about the reporter execution process.
