# Detox + Currents

Shows Detox results reaching Currents through `@currents/jest` and
`currents upload`: screen recordings, screenshots and device logs per test
attempt, the element actions of the Detox trace as steps, and the attempts of
`detox test --retries` merged into one test history.

What a Detox project adds is the reporter line in `jest.config.js`:

```js
reporters: ['detox/runners/jest/reporter', '@currents/jest'],
```

Then `detox test` followed by `currents upload`.

## How the pieces fit

- `@currents/jest` reads the Detox session (`DETOX_CONFIG_SNAPSHOT_PATH`) to
  learn the artifacts root and the rerun index, writes `detox.json` with the full
  name, status, rerun and invocation of every attempt, and marks the run as
  Detox in `config.json`.
- The report goes to `.currents/<session>`, named like the Detox artifacts root,
  unless `reportDir` is set. Every Jest process of one `detox test` writes
  there, and `currents upload` picks the newest directory in `.currents`.
- A rerun of `detox test --retries` starts Jest again for the failed spec files
  only, and Jest numbers its attempts from 0 again. The reporter merges the new
  attempts into the instance report the earlier run wrote instead of replacing
  it, so a test that passes on the second device run shows both attempts and
  reads as flaky.
- `currents upload` resolves the artifact directory of each attempt - through
  Detox's own path builder when detox is installed - copies the files into the
  report and uploads them. It runs after `detox test` has exited, because Detox
  closes the video and log files only then.
- When logs are recorded, Detox also writes `detox.trace.json`. Upload turns the
  element actions in it into steps for the attempt they belong to.
- The reporter writes `fullTestSuite.json`, so upload does not re-run Jest to
  discover the suite. Under Detox that second run boots a device and needs a
  resolvable Detox configuration.

## Running it without a device

`detoxSim/` stands in for Detox. `detoxTest.js` plays the part of
`detox test --retries 1`: it creates one session, runs Jest, and reruns the
failed spec files in a second Jest process with the rerun index bumped.
`globalTeardown.js` writes what the artifact plugins and the log finalizer would
write - under the directory names Detox gives them, with ` (n)` continuing
across the reruns.

```bash
npm run test                                             # detox test --retries 1
npm run report -- --project-id <id> --key <record key>   # upload to Currents
```

`npm run test:once` runs Jest alone, without the rerun.

To see the payload instead of uploading it, run the stub API in one terminal and
the upload against it in another:

```bash
npm run stub
npm run report:stub
```
