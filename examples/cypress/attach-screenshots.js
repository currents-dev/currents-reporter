/**
 * Adds Cypress screenshots to Cypress's JUnit reports as Currents artifact
 * properties, so that `currents run upload` uploads them with the results.
 *
 * Usage: node attach-screenshots.js <reports folder> <screenshots folder>
 *
 * Cypress saves a failure screenshot as
 * "<screenshots folder>/<spec>/<describe> -- <test> (failed).png". The report
 * has the same titles joined with spaces in the `name` of the <testcase>.
 */
const fs = require('fs');
const path = require('path');
const { Builder, parseStringPromise } = require('xml2js');

async function main(reportsDir, screenshotsDir) {
  const screenshots = listFiles(screenshotsDir).filter((file) =>
    file.endsWith('.png')
  );

  for (const reportFile of listFiles(reportsDir)) {
    if (!reportFile.endsWith('.xml')) continue;

    const report = await parseStringPromise(
      fs.readFileSync(reportFile, 'utf-8')
    );
    const suites = report.testsuites?.testsuite ?? [];
    const spec = suites.find((suite) => suite.$?.file)?.$.file;
    if (!spec) continue;

    let attached = 0;
    for (const testcase of suites.flatMap((suite) => suite.testcase ?? [])) {
      const files = screenshots.filter(
        (file) =>
          isScreenshotOfSpec(path.relative(screenshotsDir, file), spec) &&
          getTestName(file) === testcase.$.name
      );
      for (const file of files) {
        const added = addArtifact(testcase, {
          path: path.relative(process.cwd(), file),
          type: 'screenshot',
          contentType: 'image/png',
          name: path.basename(file),
        });
        if (added) attached++;
      }
    }

    fs.writeFileSync(reportFile, new Builder().buildObject(report));
    console.log(`${reportFile}: attached ${attached} screenshot(s)`);
  }
}

// The screenshot folder is the spec path relative to the folder that holds
// all specs, e.g. "login.cy.js" for "cypress/e2e/login.cy.js"
function isScreenshotOfSpec(screenshot, spec) {
  const specDir = path.dirname(screenshot).split(path.sep).join('/');
  return spec === specDir || spec.endsWith(`/${specDir}`);
}

function getTestName(file) {
  return path
    .basename(file, '.png')
    .replace(/ \(failed\)/, '')
    .replace(/ \(attempt \d+\)$/, '')
    .split(' -- ')
    .join(' ');
}

// Attempt-level properties without an index go to the first attempt. Use
// "currents.artifact.attempt.<index>.*" when tests have retries.
function addArtifact(testcase, artifact) {
  testcase.properties ??= [{ property: [] }];
  testcase.properties[0].property ??= [];
  const properties = testcase.properties[0].property;
  if (properties.some(({ $ }) => $.value === artifact.path)) return false;
  for (const [key, value] of Object.entries(artifact)) {
    properties.push({
      $: { name: `currents.artifact.attempt.${key}`, value },
    });
  }
  return true;
}

function listFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    return entry.isDirectory() ? listFiles(fullPath) : [fullPath];
  });
}

const [reportsDir, screenshotsDir] = process.argv.slice(2);
if (!reportsDir || !screenshotsDir) {
  console.error(
    'Usage: node attach-screenshots.js <reports folder> <screenshots folder>'
  );
  process.exit(1);
}
main(reportsDir, screenshotsDir).catch((error) => {
  console.error(error);
  process.exit(1);
});
