#! /usr/bin/env node

import 'source-map-support/register';

import('dotenv/config');

import { getProgram } from './program';

function runScript() {
  getProgram().parse();
}

runScript();
