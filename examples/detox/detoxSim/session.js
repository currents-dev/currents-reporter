const path = require('path');

const ARTIFACTS_LOCATION = 'artifacts';
const CONFIGURATION = 'android.emu.debug';

/**
 * Detox appends the configuration name and a session timestamp to the artifacts
 * location, then writes the resolved session to a file and points Jest at it
 * through DETOX_CONFIG_SNAPSHOT_PATH. The reporter reads the artifacts root
 * from there.
 */
const getSessionFilePath = () =>
  path.resolve(__dirname, '..', '.detox-session.json');

const getArtifactsRootDir = (timestamp) =>
  path.join(ARTIFACTS_LOCATION, `${CONFIGURATION}.${timestamp}`);

module.exports = { CONFIGURATION, getArtifactsRootDir, getSessionFilePath };
