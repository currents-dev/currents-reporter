import { yargsOptions } from 'jest-cli';
import { hideBin } from 'yargs/helpers';
import yargs from 'yargs/yargs';

export function getJestArgv() {
  const argv = yargs(hideBin(process.argv))
    .options(yargsOptions)
    .parse() as Record<string, unknown>;

  const options = Object.keys(argv)
    .filter((key) => key in yargsOptions)
    .reduce<Record<string, unknown>>((acc, key) => {
      acc[key] = argv[key];

      return acc;
    }, {});

  return {
    ...options,
    _: argv._,
    $0: argv.$0,
  };
}
