const fs = require('fs');
const { createSession, getSessionFilePath } = require('./session');

module.exports = async () => {
  const sessionFilePath = getSessionFilePath();

  // A rerun of `detox test --retries` reuses the session of the first run.
  if (!fs.existsSync(sessionFilePath)) {
    createSession();
  }

  process.env.DETOX_CONFIG_SNAPSHOT_PATH = sessionFilePath;
};
