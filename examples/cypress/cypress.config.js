const fs = require('fs');

module.exports = {
  // Cypress's built-in JUnit reporter (mocha-junit-reporter)
  reporter: 'junit',
  reporterOptions: {
    // [hash] gives each spec file its own report. Without it, each spec
    // overwrites the report of the previous one.
    mochaFile: 'results/junit-[hash].xml',
    // Without it, skipped tests are left out of the report
    includePending: true,
    // The name of the group in Currents. The default is "Mocha Tests".
    testsuitesTitle: 'e2e',
  },
  retries: 2,
  video: true,
  e2e: {
    supportFile: false,
    specPattern: 'cypress/e2e/**/*.cy.js',
    setupNodeEvents(on) {
      // The run results, with every attempt, screenshot and video, for
      // `currents run upload --input-format cypress-json`. Each GitLab
      // parallel job writes its own file.
      on('after:run', (results) => {
        fs.mkdirSync('results', { recursive: true });
        fs.writeFileSync(
          `results/cypress-results-${process.env.CI_NODE_INDEX ?? 1}.json`,
          JSON.stringify(results, null, 2)
        );
      });
    },
  },
};
