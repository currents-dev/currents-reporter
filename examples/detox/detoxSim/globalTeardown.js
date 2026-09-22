const fs = require('fs');
const path = require('path');
const { getSessionFilePath } = require('./session');

const REPORT_DIR = path.resolve(__dirname, '..', '.currents');
const FIXTURES_DIR = path.join(__dirname, 'fixtures');

/**
 * Stands in for the Detox artifact plugins: per test they write a screen
 * recording, a device log and - on failure - a screenshot, into a directory
 * named after the test. Detox marks the status with a sign and appends ` (n)`
 * for the n-th invocation of a retried test.
 */
const getTestDirName = ({ fullName, status, invocations }) => {
  const sign = status === 'passed' ? '✓ ' : status === 'failed' ? '✗ ' : '';
  const suffix = invocations > 1 ? ` (${invocations})` : '';

  return `${sign}${fullName}${suffix}`;
};

const getDeviceLog = ({ fullName, status }) =>
  [
    `01-14 09:41:02.118  1284  1284 I Detox   : Test started: ${fullName}`,
    '01-14 09:41:02.301  1284  1311 D Detox   : action=tap target=by.id("amount-input")',
    '01-14 09:41:02.884  1284  1311 D Detox   : action=typeText text="0.0421" target=by.id("amount-input")',
    '01-14 09:41:03.442  1284  1311 D Detox   : action=tap target=by.id("send-button")',
    '01-14 09:41:03.902  1284  1290 I Wallet  : POST /v1/transactions -> 202',
    status === 'failed'
      ? '01-14 09:41:08.907  1284  1311 E Detox   : expectation failed: by.id("confirm-dialog") is not visible after 5000ms'
      : '01-14 09:41:04.512  1284  1311 D Detox   : expectation passed: by.id("confirm-dialog") is visible',
    `01-14 09:41:09.044  1284  1284 I Detox   : Test finished: ${fullName} (${status})`,
    '',
  ].join('\n');

module.exports = async () => {
  const { detoxConfig } = JSON.parse(
    fs.readFileSync(getSessionFilePath(), 'utf8')
  );
  const rootDir = path.resolve(__dirname, '..', detoxConfig.artifacts.rootDir);
  const manifest = JSON.parse(
    fs.readFileSync(path.join(REPORT_DIR, 'detox.json'), 'utf8')
  );

  manifest.tests.forEach((test) =>
    test.attempts.forEach((attempt) => {
      const dir = path.join(
        rootDir,
        getTestDirName({ fullName: test.fullName, ...attempt })
      );
      fs.mkdirSync(dir, { recursive: true });

      fs.copyFileSync(
        path.join(FIXTURES_DIR, 'recording.mp4'),
        path.join(dir, 'test.mp4')
      );
      fs.writeFileSync(
        path.join(dir, 'device.log'),
        getDeviceLog({ fullName: test.fullName, status: attempt.status })
      );

      if (attempt.status === 'failed') {
        fs.copyFileSync(
          path.join(FIXTURES_DIR, 'screen.png'),
          path.join(dir, 'test-after-failure.png')
        );
      }
    })
  );

  fs.writeFileSync(path.join(rootDir, 'detox.log'), 'detox session log\n');
  console.log(
    `[detoxSim] artifacts written to ${detoxConfig.artifacts.rootDir}`
  );
};
