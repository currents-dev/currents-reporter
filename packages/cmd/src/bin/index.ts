#! /usr/bin/env node

// First, so that it runs before the other imports load code that needs a newer
// Node.js
import './checkNodeVersion';

// Before program, because parse() reads option values from the environment
import 'dotenv/config';

import { getProgram } from './program';

function runScript() {
  getProgram().parse();
}

runScript();
