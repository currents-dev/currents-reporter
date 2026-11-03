#! /usr/bin/env node

import('dotenv/config');

import { getProgram } from './program';

function runScript() {
  getProgram().parse();
}

runScript();
