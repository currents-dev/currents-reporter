/** @type {import('jest').Config} */
const config = {
  reporters: ['default', ['@currents/jest', {}]],
  projects: [
    {
      displayName: 'spec',
      testLocationInResults: true,
      testMatch: ['<rootDir>/**/*.spec.ts'],
    },
    {
      displayName: 'test',
      testLocationInResults: true,
      testMatch: ['<rootDir>/**/*.test.ts'],
    },
  ],
};

module.exports = config;
