// Stands in for Detox's test environment, which boots a device in setup().
// Each setup() call appends a line to the file in DEVICE_LOG.
const fs = require('fs');
const { TestEnvironment } = require('jest-environment-node');

module.exports = class DeviceEnvironment extends TestEnvironment {
  async setup() {
    await super.setup();
    fs.appendFileSync(process.env.DEVICE_LOG, 'setup\n');
    this.global.device = { launchApp() {} };
  }
};
