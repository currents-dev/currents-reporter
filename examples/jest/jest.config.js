/** @type {import('jest').Config} */
const config = {
  verbose: false,
  reporters: [['@currents/jest', {}], 'default'],
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
