import { yargsOptions } from "jest-cli";
import { hideBin } from "yargs/helpers";
import yargs from "yargs/yargs";

export function getJestArgv() {
  return yargs(hideBin(process.argv)).options(yargsOptions).parse();
}
