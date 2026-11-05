#!/usr/bin/env node
// Sets the version of one workspace in the root package-lock.json.
// release-it bumps only the workspace's package.json, and `npm install
// --package-lock-only` with npm 11 also drops the lockfile's "peer": true flags.
// Run from the workspace folder: node ../../scripts/set-lockfile-version.js <version>
const fs = require('fs');
const path = require('path');

const version = process.argv[2];
if (!version) {
  console.error('usage: set-lockfile-version.js <version>');
  process.exit(1);
}
const root = path.resolve(__dirname, '..');
const key = path.relative(root, process.cwd()).split(path.sep).join('/');
const file = path.join(root, 'package-lock.json');
const lock = JSON.parse(fs.readFileSync(file, 'utf8'));
if (!lock.packages[key]) {
  console.error(`no "${key}" entry in package-lock.json`);
  process.exit(1);
}
lock.packages[key].version = version;
fs.writeFileSync(file, JSON.stringify(lock, null, 2) + '\n');
console.log(`package-lock.json: ${key} is ${version}`);
