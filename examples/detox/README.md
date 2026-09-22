# Detox + Currents

Shows Detox artifacts - screen recordings, screenshots and device logs - reaching
Currents through `@currents/jest` and `currents upload`, per test attempt.

What a Detox project adds is the reporter line in `jest.config.js`:

```js
reporters: ['detox/runners/jest/reporter', ['@currents/jest', { reportDir: './.currents' }]],
```

Then `detox test` followed by `currents upload --report-dir ./.currents`.

## How the pieces fit

- `@currents/jest` reads the Detox session (`DETOX_CONFIG_SNAPSHOT_PATH`) to learn
  the artifacts root, writes `detox.json` with the full name, status and
  invocation of every attempt, and marks the run as Detox in `config.json`.
- `currents upload` resolves the artifact directory of each attempt - through
  Detox's own path builder when detox is installed - copies the files into the
  report and uploads them. It runs after `detox test` has exited, because Detox
  closes the video and log files only then.
- The reporter also writes `fullTestSuite.json`, so upload does not re-run Jest
  to discover the suite. Under Detox that second run boots a device and needs a
  resolvable Detox configuration.

## Running it without a device

`detoxSim/` stands in for Detox: `globalSetup` writes a session file the way
`detox test` does, and `globalTeardown` writes the artifacts its plugins would
write, under the directory names Detox gives them - the status sign, and ` (n)`
for the n-th invocation of a retried test.

```bash
npm run test                                             # jest + @currents/jest
npm run report -- --project-id <id> --key <record key>   # upload to Currents
```

To see the payload instead of uploading it, run the stub API in one terminal and
the upload against it in another:

```bash
npm run stub
npm run report:stub
```
