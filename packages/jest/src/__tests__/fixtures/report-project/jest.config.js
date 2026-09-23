/**
 * Run by src/__tests__/reporter.test.ts, which sets the reporter to test and
 * where it writes the report.
 */
/** @type {import('jest').Config} */
module.exports = {
  reporters: [
    [
      process.env.CURRENTS_TEST_REPORTER,
      { reportDir: process.env.CURRENTS_TEST_REPORT_DIR },
    ],
  ],
  projects: [
    {
      displayName: 'checks',
      testLocationInResults: true,
      testMatch: ['<rootDir>/specs/**/*.check.js'],
    },
    {
      displayName: 'probes',
      testLocationInResults: true,
      testMatch: ['<rootDir>/api/**/*.probe.js'],
    },
  ],
};
