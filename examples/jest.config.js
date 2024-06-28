/** @type {import('jest').Config} */
const config = {
  testTimeout: 10000,
  reporters: [
    // "default",
    ["@currents/jest-reporter", {}],
  ],
  // projects: [
  //   {
  //     displayName: "spec",
  //     testMatch: ["<rootDir>/**/*.spec.ts"],
  //   },
  //   {
  //     displayName: "test",
  //     testMatch: ["<rootDir>/**/*.test.ts"],
  //   },
  // ],
};

module.exports = config;
