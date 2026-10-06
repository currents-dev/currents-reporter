/** @type {import('jest').Config} */
module.exports = {
  // The report directory comes from CURRENTS_REPORT_DIR.
  reporters: ['default', '@currents/jest'],
  testMatch: ['<rootDir>/specs/**/*.test.js'],
};
