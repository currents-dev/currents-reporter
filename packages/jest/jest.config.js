/** @type {import('jest').Config} */
module.exports = {
  // The group of the run in Currents.
  displayName: 'jest',
  // Set in CI, where the report is uploaded to Currents.
  reporters: process.env.CURRENTS_REPORT_DIR
    ? ['default', '@currents/jest']
    : ['default'],
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/*.test.ts'],
  passWithNoTests: true,
};
