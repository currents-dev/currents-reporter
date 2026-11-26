import os from 'os';
import path from 'path';

// Set in CI, where the JUnit report is converted and uploaded to Currents. The
// suite name becomes the group of the run.
const junitFile = process.env.CURRENTS_JUNIT_FILE;

const config = {
  test: {
    globalSetup: ['./vitest.global-setup.ts'],
    // A directory without credentials.json, so that no test sends the login
    // of the person running the tests.
    env: {
      CURRENTS_CONFIG_DIR: path.join(
        os.tmpdir(),
        'currents-cmd-tests-no-login'
      ),
    },
    ...(junitFile
      ? {
          reporters: ['default', ['junit', { suiteName: 'cmd' }]],
          outputFile: { junit: junitFile },
        }
      : {}),
  },
  resolve: {
    alias: {
      '@debug': path.resolve(__dirname, './src/debug'),
      '@env': path.resolve(__dirname, './src/env'),
      '@lib': path.resolve(__dirname, './src/lib'),
      '@logger': path.resolve(__dirname, './src/logger'),
      '@currents/rules': path.resolve(__dirname, '../rules/src'),
    },
  },
};

export default config;
