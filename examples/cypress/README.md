# Cypress + Currents

Shows Cypress 13+ results reaching Currents without a Currents package in the
Cypress project, uploaded from a separate CI job in one of two ways:

- Cypress's built-in `junit` reporter writes the reports, and
  `currents run upload --input-format junit --framework cypress` uploads them
  with failure screenshots. JUnit has the last attempt of each test only.
- Cypress's run results, saved by `after:run` in `cypress.config.js`, and
  `currents run upload --input-format cypress-json` upload every attempt, the
  screenshots of each attempt, and the videos. See
  [Every attempt, screenshot and video](#every-attempt-screenshot-and-video).

## Run it

Cypress is not a dependency of this example, so that `npm install` in this
repository does not download the Cypress binary. `npm run test` runs it with
`npx`.

The `report` scripts run the `currents` command of this repository. Build it
first: `npm install` at the repository root, `npm run build` in
`packages/cmd`, then `npm install` at the root again, which links the command
now that it is built.

```bash
npm run test                 # cypress run: results/, cypress/screenshots/, cypress/videos/
npm run attach-screenshots   # add the screenshots to the JUnit reports
npm run report -- --project-id <id> --key <record key>        # JUnit
npm run report:json -- --project-id <id> --key <record key>   # run results
```

Add `CURRENTS_API_URL=http://localhost:1234` to upload to a local Currents API.

`login.cy.js` has one test that fails on purpose, so that the run has a failure
with a screenshot, and one skipped test. `flaky.cy.js` fails on the first
attempt and passes on the retry. The configuration has `retries: 2` and
`video: true`.

## Cypress configuration

`cypress.config.js`:

```js
reporter: 'junit',
reporterOptions: {
  mochaFile: 'results/junit-[hash].xml',
  includePending: true,
  testsuitesTitle: 'e2e',
},
```

- `[hash]` in `mochaFile` gives each spec file its own report. Without it, each
  spec overwrites the report of the previous one and only the last spec is
  uploaded.
- `includePending: true` keeps skipped tests (`it.skip`) in the report. Without
  it, they are left out and Currents does not show them.
- `testsuitesTitle` is the name of the group in Currents. The default is
  "Mocha Tests".

## What `--framework cypress` does

Cypress's reporter writes the spec file path only on the first `<testsuite>`
("Root Suite") of a report. Each `describe` block is a separate `<testsuite>`
without the path. With `--framework cypress`, upload:

- creates one spec in Currents for each report, named by the spec file path,
  with the tests of all its `describe` blocks;
- splits the test title into the `describe` titles and the test's own title,
  for example `Login password` and `hides the password`. Nested `describe`
  titles are joined with spaces in the report, so they stay one part;
- reads the report timestamps as UTC. The reporter writes them without a time
  zone.

A report without the spec file path is converted like the other frameworks: one
spec for each `<testsuite>`.

## Screenshots

The JUnit reports do not refer to the screenshots. `attach-screenshots.js`
matches each screenshot to its test by name and adds it to the report as
Currents artifact properties (see
[artifacts.md](../../packages/cmd/src/services/convert/artifacts.md)). Upload
then copies and uploads the files.

- Cypress names a failure screenshot `<spec>/<describe> -- <test> (failed).png`.
  Screenshots with a custom name (`cy.screenshot('name')`) do not match a test
  and are not attached. The script lists the screenshots it did not attach.
- Tests with the same title in one spec file get screenshots with the same
  name, which the script cannot tell apart. It attaches none of them and
  prints a warning.
- Each screenshot goes to the first attempt of the test. With Cypress retries,
  the report has the last attempt only.
- The script uses paths relative to the folder it runs in. Run it and
  `currents run upload` from the same folder.

## Every attempt, screenshot and video

The JUnit reports have the last attempt of each test only: a test that passes
on a retry reads as passed, and its failed attempts are lost. Cypress's run
results have every attempt. `cypress.config.js` saves them:

```js
setupNodeEvents(on) {
  on('after:run', (results) => {
    fs.mkdirSync('results', { recursive: true });
    fs.writeFileSync(
      `results/cypress-results-${process.env.CI_NODE_INDEX ?? 1}.json`,
      JSON.stringify(results)
    );
  });
},
```

This is Cypress configuration only. No Currents package runs in the Cypress
job. Upload the file with:

```bash
npx currents run upload --input-format cypress-json --input-file "results/cypress-results-*.json"
```

`--framework` is not needed: it is `cypress`, and the Cypress version comes
from the file. Upload:

- creates one spec for each spec file, with the full test titles, for example
  `Login` › `password` › `hides the password`;
- creates an attempt for each try of a test, and marks a test that passed on a
  retry as flaky;
- attaches each failure screenshot to its attempt, by the
  `(attempt <n>)` in its file name;
- attaches the video of a spec to its failed attempts. Currents does not show a
  spec-level video yet, so a spec without failures keeps its video at the spec
  level, where it is stored but not shown;
- names the group by the browser, for example `electron`.

Limits:

- Cypress keeps the error of the last failed attempt only. Earlier failed
  attempts have no error.
- Cypress reports one duration for all attempts of a test. Each attempt gets an
  equal part of it.
- The file has absolute paths. Upload reads the screenshots and videos relative
  to the Cypress project, so run it from the project folder.

## GitLab CI

[.gitlab-ci.yml](.gitlab-ci.yml) runs Cypress on 2 parallel jobs and uploads
the results of both from a later job, to one Currents run.

- The `cypress` jobs do not need Currents packages, variables or configuration.
  They keep the results, screenshots and videos as job artifacts.
- Without Cypress Cloud, each Cypress job runs every spec.
  [split-specs.js](split-specs.js) gives each job every `CI_NODE_TOTAL`-th spec
  file, by `CI_NODE_INDEX`. With one job, remove `parallel` and `--spec`.
- Each job writes `results/cypress-results-<CI_NODE_INDEX>.json`, so the files
  of the jobs do not overwrite each other in the `currents` job.
- The `currents` job downloads the artifacts of every `cypress` job, and
  uploads all result files in one command. `--input-format cypress-json` needs
  `@currents/cmd` newer than 2.2.0. `when: always` uploads the results
  when a Cypress job fails.
- Without `--ci-build-id`, Currents creates one run for each GitLab pipeline
  (`CI_PIPELINE_ID`). Uploads from several jobs of the same pipeline go to the
  same run.
- Upload reads the commit from git and the GitLab CI variables, as the
  Playwright reporter does. `COMMIT_INFO_*` variables, for example
  `COMMIT_INFO_MESSAGE`, replace what git reports.
- `CURRENTS_TAG` (comma-separated) adds tags to the run.
  `CURRENTS_ENVIRONMENT` labels the run with an environment.
- Run the upload from the Cypress project folder: the screenshots and videos
  are read relative to it.

For the JUnit reports, install `xml2js` as well, run
`node attach-screenshots.js results cypress/screenshots`, and upload with
`--input-format junit --input-file "results/*.xml" --framework cypress`.
