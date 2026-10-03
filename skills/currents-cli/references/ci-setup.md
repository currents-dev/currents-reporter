# CI setup

Steps for GitHub Actions and GitLab CI. They assume `@currents/cmd` is in the project's `devDependencies`, so that `npx currents` runs it.

In every example:

- the record key is a CI secret, passed as `CURRENTS_RECORD_KEY`;
- `CURRENTS_PROJECT_ID` holds the project ID;
- `CURRENTS_CI_BUILD_ID` is set once for the job, so that the reporter, `run attach` and `run cancel` find the same run. It includes the attempt number, so a rerun of the workflow records a new run.

## GitHub Actions

```yaml
env:
  CURRENTS_PROJECT_ID: <project-id>
  CURRENTS_RECORD_KEY: ${{ secrets.CURRENTS_RECORD_KEY }}
  CURRENTS_CI_BUILD_ID: ${{ github.repository }}-${{ github.run_id }}-${{ github.run_attempt }}

jobs:
  test:
    runs-on: ubuntu-latest
    strategy:
      fail-fast: false
      matrix:
        shard: [1, 2]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: npm ci
      # Steps from the sections below go here.
```

### Upload after a reporter

`@currents/jest` (also used for Detox) and `@currents/node-test-reporter` write results to `.currents/`. Upload them in a step that runs when the tests fail too:

```yaml
- run: npx jest --shard=${{ matrix.shard }}/${{ strategy.job-total }}
- if: ${{ !cancelled() }}
  run: npx currents upload
```

For JUnit XML, convert the reports first:

```yaml
- if: ${{ !cancelled() }}
  run: |
    npx currents convert --input-format junit --input-file "reports/*.xml" --framework postman
    npx currents upload
```

`--framework` takes `postman`, `node`, `vitest` or `wdio`. See `currents convert --help`.

### Attach files to the run

After the tests, attach logs to the run. `--machine-id` names the CI machine the files come from, and files of the whole run are listed under it:

```yaml
- if: ${{ !cancelled() }}
  run: |
    docker compose logs > docker-logs.txt
    npx currents run attach --machine-id shard-${{ matrix.shard }} docker-logs.txt
```

To attach a file to one test, pass `--spec` and `--test-title` in place of `--machine-id`. See `currents run attach --help`.

### Cancel the run when the workflow is cancelled

```yaml
- if: ${{ cancelled() }}
  run: npx currents run cancel
```

It cancels the run with `CURRENTS_CI_BUILD_ID` in the project. If the job was cancelled before the run was created, it prints `No run to cancel` and exits with `0`.

### Rerun only the failed Playwright tests

Restore the last run before the tests and save it after them:

```yaml
- run: npx currents cache get --preset last-run --matrix-index ${{ matrix.shard }} --matrix-total ${{ strategy.job-total }} --continue
- run: npx playwright test $(cat .currents_env)
- if: ${{ !cancelled() }}
  run: npx currents cache set --preset last-run --matrix-index ${{ matrix.shard }} --matrix-total ${{ strategy.job-total }}
```

- `cache get` writes the Playwright options to `.currents_env` (change the path with `--preset-output`). On the first attempt they are `--shard=<index>/<total>`. When the workflow is rerun and the last run was saved, they are `--last-failed --shard=1/1`.
- `--continue` lets the first attempt go on when there is no saved run yet.
- `cache set` saves Playwright's `.last-run.json` from `test-results` (change it with `--pw-output-dir`).
- `--matrix-index` starts at 1.

## GitLab CI

Set `CURRENTS_RECORD_KEY` as a masked CI/CD variable in the project settings.

### Upload after a reporter

```yaml
test:
  variables:
    CURRENTS_PROJECT_ID: <project-id>
    CURRENTS_CI_BUILD_ID: $CI_PIPELINE_ID
  script:
    - npm ci
    - npx jest
  after_script:
    - npx currents upload
```

`after_script` runs when the tests fail too. For JUnit XML, run `npx currents convert` before the upload, as in the GitHub Actions example.

### Attach files and cancel the run

`after_script` also runs when the job is cancelled, and `CI_JOB_STATUS` says how the job ended:

```yaml
after_script:
  - npx currents run attach --machine-id $CI_JOB_ID docker-logs.txt
  - if [ "$CI_JOB_STATUS" = "canceled" ]; then npx currents run cancel; fi
```

### Rerun only the failed Playwright tests

```yaml
test:
  parallel: 2
  variables:
    CURRENTS_PROJECT_ID: <project-id>
  script:
    - npm ci
    - npx currents cache get --preset last-run --continue
    - . ./.currents_env
    - export CURRENTS_CI_BUILD_ID="$CI_PIPELINE_ID-$RUN_ATTEMPT"
    - npx playwright test $EXTRA_PW_FLAGS
  after_script:
    - npx currents cache set --preset last-run
```

On GitLab, `.currents_env` sets three variables:

- `EXTRA_PW_FLAGS`: options for `playwright test`, `--shard=<index>/<total>` from `CI_NODE_INDEX` and `CI_NODE_TOTAL`, or `--last-failed --shard=1/1` on a retried job whose last run was saved;
- `EXTRA_PWCP_FLAGS`: `--last-failed` or nothing, for `pwc`;
- `RUN_ATTEMPT`: 1 on the first attempt, one more on each retry. Use it in `CURRENTS_CI_BUILD_ID` so that a retry records a new run.
