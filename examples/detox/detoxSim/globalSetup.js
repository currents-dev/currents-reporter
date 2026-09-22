const fs = require('fs');
const {
  CONFIGURATION,
  getArtifactsRootDir,
  getSessionFilePath,
} = require('./session');

module.exports = async () => {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const sessionFilePath = getSessionFilePath();

  fs.writeFileSync(
    sessionFilePath,
    JSON.stringify({
      id: 'detox-poc-session',
      detoxConfig: {
        configurationName: CONFIGURATION,
        artifacts: { rootDir: getArtifactsRootDir(timestamp) },
      },
    })
  );

  process.env.DETOX_CONFIG_SNAPSHOT_PATH = sessionFilePath;
};
