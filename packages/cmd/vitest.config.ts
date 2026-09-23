import path from 'path';

// Set in CI, where the JUnit report is converted and uploaded to Currents. The
// suite name becomes the group of the run.
const junitFile = process.env.CURRENTS_JUNIT_FILE;

const config = {
  test: junitFile
    ? {
        reporters: ['default', ['junit', { suiteName: 'cmd' }]],
        outputFile: { junit: junitFile },
      }
    : {},
  resolve: {
    alias: {
      '@debug': path.resolve(__dirname, './src/debug'),
      '@env': path.resolve(__dirname, './src/env'),
      '@lib': path.resolve(__dirname, './src/lib'),
      '@logger': path.resolve(__dirname, './src/logger'),
    },
  },
};

export default config;
