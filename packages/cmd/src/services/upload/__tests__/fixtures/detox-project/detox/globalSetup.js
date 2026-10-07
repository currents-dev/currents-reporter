const fs = require('fs');

module.exports = () => {
  fs.appendFileSync(process.env.DEVICE_LOG, 'globalSetup\n');
};
