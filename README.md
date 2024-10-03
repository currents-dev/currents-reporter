# currents-reporter

A monorepo which contains the following packages:

- `@currents/jest` - a jest reporter that writes the test results to json files in a Currents friendly manner
- `@currents/cmd` - exposes the `currents` command which is used to interact with Currents APIs. It includes the following commands:
  - `upload` command - used to discover the full test suite and upload the test results into the Currents Dashboard
  - `api` command - retrieves information about Currents entities
  - `cache` command - provides a convenient way to store and receive test artifacts
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

Set the `projectId`, `recordKey` and optionlly the `ciBuildId`. Run `npx currents upload --help` for details.

Run `npm run report` or `CURRENTS_API_URL=http://localhost:1234 CURRENTS_PROJECT_ID=xxx CURRENTS_RECORD_KEY=yyy npx currents upload`

To enable the debug mode, prefix the command with `DEBUG=currents,currents:*` or use the `--debug` option.

To provide a custom report dir path, use `CURRENTS_REPORT_DIR` env variable or `--report-dir` option.

### Obtaining run information

Run `CURRENTS_REST_API_URL=http://localhost:4000 CURRENTS_PROJECT_ID=xxx npx currents api get-run --api-key <api-key> --ci-build-id <ci-build-id> --output run.json`

Run `npx currents api --help` to see all available api commands.

To explore additional examples and filtering options for receiving runs, you can utilize the `npx currents api get-run --help` command.

### Caching artifacts

The `currents cache` command allows you to archive files from specified locations and save them under an ID in Currents storage. It also stores a meta file with configuration data. You can provide the ID manually or it can be generated based on CI environment variables (only GitHub and GitLab are supported). The files to archive can be defined using the `path <path-1,path2,...,path-n>` CLI option or predefined using a `preset`.

To cache files, run `npx currents cache set --key <record-key> --id <id> --path <path-1,path-2,...path-n>`.

To download files, run `npx currents cache get --key <record-key> --id <id>`.

For more examples and usage options, run `npx currents cache --help`.

## Release

```sh
cd ./packages/name

# beta / alpha
# npm run release --  --preRelease=beta|alpha
npm run release
```

## Publishing

Use GitHub Actions Workflow to automatically publish new releases: https://github.com/currents-dev/currents-reporter/actions/workflows/publish.yaml
