const cp = require('child_process');
const fs = require('fs');
const path = require('path');
const {
  createSession,
  getSessionFilePath,
  readSession,
  writeSession,
} = require('./session');

const RETRIES = Number(process.env.DETOX_RETRIES ?? 1);
const EXAMPLE_DIR = path.resolve(__dirname, '..');
const REPORT_DIR = path.join(EXAMPLE_DIR, '.currents');

/**
 * Stands in for `detox test --retries`: one session, and a new Jest process per
 * rerun that runs only the spec files which failed.
 */
const runJest = (specs) => {
  const result = cp.spawnSync(
    'npx',
    ['jest', '--config', 'jest.config.js', ...specs],
    {
      cwd: EXAMPLE_DIR,
      stdio: 'inherit',
      env: { ...process.env, DETOX_CONFIG_SNAPSHOT_PATH: getSessionFilePath() },
    }
  );

  return result.status === 0;
};

const getFailedSpecs = () => {
  const instancesDir = path.join(REPORT_DIR, 'instances');

  return fs
    .readdirSync(instancesDir)
    .map((file) =>
      JSON.parse(fs.readFileSync(path.join(instancesDir, file), 'utf8'))
    )
    .filter((instance) =>
      instance.results.tests.some((test) => test.state === 'failed')
    )
    .map((instance) => instance.spec);
};

const main = () => {
  fs.rmSync(REPORT_DIR, { recursive: true, force: true });
  fs.rmSync(path.join(EXAMPLE_DIR, 'artifacts'), {
    recursive: true,
    force: true,
  });
  fs.rmSync(getSessionFilePath(), { force: true });
  createSession();

  let passed = runJest([]);

  for (let retry = 0; !passed && retry < RETRIES; retry++) {
    const specs = getFailedSpecs();
    if (specs.length === 0) {
      break;
    }

    const session = readSession();
    session.testSessionIndex += 1;
    writeSession(session);

    console.log(
      `\n[detoxSim] rerunning ${specs.join(', ')} (retry ${retry + 1})\n`
    );
    passed = runJest(specs);
  }

  console.log(`\n[detoxSim] done, tests ${passed ? 'passed' : 'failed'}`);
};

main();
