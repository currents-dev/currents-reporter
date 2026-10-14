/**
 * Prints the spec files of one GitLab parallel job, comma-separated, for
 * `cypress run --spec`. Without Cypress Cloud, Cypress runs every spec on every
 * machine, so each job picks every CI_NODE_TOTAL-th spec file.
 *
 * Usage: npx cypress run --spec "$(node split-specs.js)"
 */
const fs = require('fs');
const path = require('path');

const specDir = 'cypress/e2e';
const nodeIndex = Number(process.env.CI_NODE_INDEX ?? 1);
const nodeTotal = Number(process.env.CI_NODE_TOTAL ?? 1);

function listSpecs(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) return listSpecs(fullPath);
    return entry.name.endsWith('.cy.js') ? [fullPath] : [];
  });
}

const specs = listSpecs(specDir)
  .sort()
  .filter((_, index) => index % nodeTotal === nodeIndex - 1);

if (specs.length === 0) {
  console.error(`No spec files for job ${nodeIndex} of ${nodeTotal}`);
  process.exit(1);
}
console.log(specs.join(','));
