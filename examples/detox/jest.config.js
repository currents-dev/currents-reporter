/**
 * The Detox + Currents setup this POC demonstrates. In a real project
 * `detox/runners/jest/*` provide globalSetup, globalTeardown and the test
 * environment; here detoxSim/ stands in for them so the example runs without a
 * device. The reporters line is what a customer adds.
 */
module.exports = {
  maxWorkers: 1,
  testMatch: ['<rootDir>/e2e/*.test.js'],
  testLocationInResults: true,
  globalSetup: './detoxSim/globalSetup.js',
  globalTeardown: './detoxSim/globalTeardown.js',
  reporters: ['default', '@currents/jest'],
};
