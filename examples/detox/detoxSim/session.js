const fs = require('fs');
const path = require('path');

const ARTIFACTS_LOCATION = 'artifacts';
const CONFIGURATION = 'android.emu.debug';

const getSessionFilePath = () =>
  process.env.DETOX_CONFIG_SNAPSHOT_PATH ||
  path.resolve(__dirname, '..', '.detox-session.json');

const readSession = () =>
  JSON.parse(fs.readFileSync(getSessionFilePath(), 'utf8'));

const writeSession = (session) =>
  fs.writeFileSync(getSessionFilePath(), JSON.stringify(session, null, 2));

/**
 * Detox resolves the artifacts root once per session - the configuration name
 * plus a timestamp - and keeps it across the reruns of `detox test --retries`,
 * bumping testSessionIndex instead. The Jest process learns the root from the
 * session file it is pointed at.
 */
const createSession = () => {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const session = {
    id: 'detox-poc-session',
    testSessionIndex: 0,
    detoxConfig: {
      configurationName: CONFIGURATION,
      artifacts: {
        rootDir: path.join(ARTIFACTS_LOCATION, `${CONFIGURATION}.${timestamp}`),
      },
    },
  };

  writeSession(session);

  return session;
};

module.exports = {
  CONFIGURATION,
  createSession,
  getSessionFilePath,
  readSession,
  writeSession,
};
