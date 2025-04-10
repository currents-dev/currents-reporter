#!/usr/bin/env node

import { execSync } from 'child_process';
import fs from 'fs';
import { Command } from 'commander';

const program = new Command()
  .name('publish')
  .option('-t, --tag <alpha | beta | latest>', 'npm dist-tag to publish to');

program.parse(process.argv);
const options = program.opts();

console.log(options);
if (!options.tag) {
  console.log('No tag supplied: beta or latest');
  process.exit(1);
}
console.log(process.cwd());

fs.copyFileSync('../../LICENSE.md', './LICENSE.md');
execSync(`npm pack --dry-run && npm publish --tag ${options.tag}`, {
  cwd: './',
  stdio: 'inherit',
});
