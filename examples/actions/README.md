# Currents Actions + currents run upload

Shows [Currents Actions](https://docs.currents.dev/guides/currents-actions) applied to results uploaded with `currents run upload` (`@currents/cmd` 2.3.0 or later), and `--fail-on-failures` failing the CI job only for failures that no action quarantined.

`wallet.xml` is a JUnit report, as a Detox or Jest project writes it, with three tests:

| Test                  | Result                  | Action       | In Currents                                                                       |
| --------------------- | ----------------------- | ------------ | --------------------------------------------------------------------------------- |
| `shows the balance`   | failed on both attempts | quarantine   | skipped, labelled Quarantine; both attempts stay failed, each with its device log |
| `loads the history`   | passed                  | tag `mobile` | passed, tagged `mobile`                                                           |
| `exports a statement` | passed                  | skip         | skipped; its attempt stays passed                                                 |

## Create the actions

In the Currents project, open **Actions** and create:

1. **Quarantine the balance test**: action _Quarantine_, conditions _Test Title_ is `shows the balance` and _File_ is `e2e/wallet.test.js`.
2. **Tag the history test**: action _Tag_ `mobile`, condition _Test Title_ is `loads the history`.
3. **Skip the statement export**: action _Skip_, condition _Test Title_ is `exports a statement`.

The upload does not apply actions with regex or date conditions yet.

## Upload

```sh
npm install
export CURRENTS_PROJECT_ID=<project-id>
export CURRENTS_RECORD_KEY=<record-key>
npm run report
```

`npm run report` converts and uploads the report:

```sh
currents run upload --input-format=junit --input-file=./wallet.xml --framework=node --fail-on-failures
```

With the actions, it prints `Actions: 1 tests skipped, 1 quarantined, 1 tagged` and exits with 0: the only failure is quarantined.

Disable the quarantine action and upload again. The command lists `shows the balance` as failed and exits with 1.

## In CI

Let the test command pass, and let the upload decide the result of the job:

```sh
npx detox test || true
npx currents run upload --input-format=junit --input-file="reports/*.xml" --framework=node --fail-on-failures
```
