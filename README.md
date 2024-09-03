# currents-reporter

A monorepo which contains the following packages:

- `@currents/jest` - a jest reporter that writes the test results to json files in a Currents friendly manner
- `@currents/cmd` - exposes `currents` command which is used to discover the full test suite and upload the test results into Currents Dashboard.
- `examples` - a private package used to test the implementation

## Testing locally

- `npm i`
- `npm run build`
- `cd ./examples`

### Creating a report

Run `npm run test` to run example spec files.

In order to test different scenarious, update the jest configuration by modifying the `jest.config.js` file or run the command with jest cli options.

To enable the debug mode, prefix the command with `DEBUG=currents-jest`

For a custom path for the report directory, set an absolute path to the `reportDir` option for to the reporter configuration:

```javascript
  reporters: [
    // "default",
    ["@currents/jest", {
        reportDir: "/home/slavic/Desktop/.jest-report"
    }],
  ],
```

### Uploading the results

Set the `projectId`, `recordKey` and optionlly the `ciBuildId`. Run `npx currents --help` for details.

Run `npm run report` or `CURRENTS_API_URL=http://localhost:1234 CURRENTS_PROJECT_ID=xxx CURRENTS_RECORD_KEY=yyy npx currents upload`

To enable the debug mode, prefix the command with `DEBUG=currents,currents:*` or use the `--debug` option.

To provide a custom report dir path, use `CURRENTS_REPORT_DIR` env variable or `--report-dir` option.

## Release

```sh
cd ./packages/name

# beta / alpha
# npm run release --  --preRelease=beta|alpha
npm run release
```

## Publishing

Use GitHub Actions Workflow to automatically publish new releases: https://github.com/currents-dev/currents-reporter/actions/workflows/publish.yaml
