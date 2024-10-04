import chalk from 'chalk';
import util from 'util';

import { debug } from '../debug';
import { addToLogDrain } from './logDrain';
import { errors, warnings } from './notices';

const log = (...args: unknown[]) => {
  const stringToRender = util.format(...args);
  addToLogDrain(stringToRender);
  console.log(stringToRender);
};

const _error = (...args: unknown[]) => {
  const stringToRender = util.format(...args);
  addToLogDrain(stringToRender);
  console.error(stringToRender);
};

export const info = log;

export const warn = (...args: unknown[]) => {
  const msg = util.format(...args);
  warnings.push(msg);
  debug('WARNING: ', msg);
  return log(chalk.bgYellow.black(' WARNING '), msg);
};
export const warnWithNoTrace = (...args: unknown[]) => {
  const msg = util.format(...formatArgs(args));
  debug('WARNING: ', util.format(...args));
  return log(chalk.bgYellow.black(' WARNING '), msg);
};

export const success = (...args: unknown[]) =>
  log(chalk.green.bold(util.format(...args)));

export const error = (...args: unknown[]) => {
  const msg = util.format(...formatArgs(args));
  errors.push(msg);
  debug('ERROR: ', util.format(...args));
  return _error(chalk.bgRed.white(' ERROR '), msg);
};

export const title = (...args: unknown[]) =>
  info(chalk.blue.bold(util.format(...args)));

export const titleContent = (...args: unknown[]) =>
  chalk.blue.bold(util.format(...args));

export const divider = () => console.log('\n' + dividerContent() + '\n');

export const dividerContent = () => chalk.dim(Array(64).fill('=').join(''));

export const blockStart = (label = '', lineLength = 64) => {
  const _label = ` start of ${label ?? 'block'} `;
  const padding = Math.max(lineLength - _label.length, 0) / 2;
  const padStart = Math.floor(padding);
  const padEnd = Math.ceil(padding);

  return chalk.dim(
    `${Array(padStart).fill('-').join('')}${_label}${Array(padEnd)
      .fill('-')
      .join('')}`
  );
};

export const blockEnd = (label = '', lineLength = 64) => {
  const _label = ` end of ${label ?? 'block'} `;
  const padding = Math.max(lineLength - _label.length, 0) / 2;
  const padStart = Math.floor(padding);
  const padEnd = Math.ceil(padding);

  return chalk.dim(
    `${Array(padStart).fill('-').join('')}${_label}${Array(padEnd)
      .fill('-')
      .join('')}`
  );
};

const formatArgs = (args: unknown[]) =>
  args.map((arg) => (arg instanceof Error ? arg.message : arg));

export const spacer = (n: number = 2) =>
  console.log(Array(n).fill('').join('\n'));

export const cyan = chalk.cyan;
export const blue = chalk.blueBright;
export const red = chalk.red;
export const yellow = chalk.yellow;
export const green = chalk.green;
export const gray = chalk.gray;
export const white = chalk.white;
export const black = chalk.black;
export const magenta = chalk.magenta;
export const dim = chalk.dim;
export const bold = chalk.bold;
