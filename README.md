# currents-reporter

A monorepo which contains the following packages:

- `@currents/jest` - Currents jest reporter ([documentation](https://docs.currents.dev/resources/reporters/currents-jest)).
- `@currents/cmd` - `currents` CLI command ([documentation](https://docs.currents.dev/resources/reporters/currents-cmd))
- `@currents/node-test-reporter` - Currents Node.js test reporter
- `examples` - a private package used to test the implementation

## Develop and contribute
- run `npm i`
- run `npm run dev`

* in case you would like to test the `examples` folder, please run the `npm link` command as well:
- go the desired package. i.e. `cd packages/cmd`
- run `npm link` - This will create a global symlink to the package.
- go the desired examples folder. i.e. `cd examples/postman`
- run `npm link @currents/cmd`.
- Now you can call the `currents` command and it will call the local repo code.

notice: the `npm run dev` is compiling and building the package on each change, in case it is not running you will have to manually call the build command.


## Testing locally

- `npm i`
- `npm run build`
- `cd ./examples`

#### Creating a report using Jest

- `cd examples/jest`

Run `npm run test` to run example spec files.

In order to test different scenarios, update the jest configuration by modifying the `jest.config.js` file or run the command with jest cli options.

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

Set the `projectId`, `recordKey` and optionally the `ciBuildId`. Run `npx currents upload --help` for details.

Run `npm run report` or `CURRENTS_API_URL=http://localhost:1234 CURRENTS_PROJECT_ID=xxx CURRENTS_RECORD_KEY=yyy npx currents upload`

To enable the debug mode, prefix the command with `DEBUG=currents,currents:*` or use the `--debug` option.

To provide a custom report dir path, use `CURRENTS_REPORT_DIR` env variable or `--report-dir` option.

### Obtaining run information

Run `CURRENTS_REST_API_URL=http://localhost:4000 CURRENTS_PROJECT_ID=xxx npx currents api get-run --api-key <api-key> --ci-build-id <ci-build-id> --output run.json`

Run `npx currents api --help` to see all available api commands.

To explore additional examples and filtering options for receiving runs, you can utilize the `npx currents api get-run --help` command.

### Caching artifacts

The `currents cache` command allows you to archive files from specified locations and save them under an ID in Currents storage. It also stores a meta file with configuration data. You can provide the ID manually or it can be generated based on CI environment variables (only GitHub, GitLab, and Circle CI are supported). The files to archive can be defined using the `path <path-1,path2,...,path-n>` CLI option or predefined using a `preset`.

To cache files, run `npx currents cache set --key <record-key> --id <id> --path <path-1,path-2,...path-n>`.

To download files, run `npx currents cache get --key <record-key> --id <id>`.

For more examples and usage options, run `npx currents cache --help`.

## Release

Create and push new branch for release (to be merged to main after publishing). This is required because we don't accept pushes direct to main.

```sh
# git checkout -b release/{pkgname}-{version}
git checkout -b release/cmd-1.1.0
```

Push that branch to the repo. (It has to be present on the remote for `release-it` to run).

Release the package by running the release task which tags, and pushes the release.

```sh
cd ./packages/name

# beta / alpha
# npm run release -- minor|patch --preRelease=beta|alpha
npm run release
```

You can create a PR from the release branch to be merged after publish.

## Publishing

Dispatch the GitHub Actions Workflow to publish new releases: https://github.com/currents-dev/currents-reporter/actions/workflows/publish.yaml

Ensure to point the workflow at the release branch OR tag if the release branch has not already been merged to main.

After the publish is complete, the release branch PR should be merged to main.

