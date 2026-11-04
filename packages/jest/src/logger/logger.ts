import util, { styleText } from 'util';

import { debug } from '../lib/debug';
import { addToLogDrain } from './logDrain';
import { errors, warnings } from './notices';

type Format = Exclude<Parameters<typeof styleText>[0], readonly unknown[]>;

/**
 * Returns a function that styles its arguments, joined with spaces, with the
 * formats. Empty text stays empty. Each format is a separate styleText call: on
 * Node.js 22.13, styleText with an array of formats colors text that does not
 * go to a terminal.
 */
const style =
  (...formats: Format[]) =>
  (...text: unknown[]) => {
    const joined = text.join(' ');
    return joined
      ? formats.reduceRight(
          (styled, format) => styleText(format, styled),
          joined
        )
      : '';
  };

const log = (...args: unknown[]) => {
  const stringToRender = util.format(...args);
  addToLogDrain(stringToRender);
  console.log(stringToRender);
};

export const info = log;

export const warn = (...args: unknown[]) => {
  const msg = util.format(...args);
  warnings.push(msg);
  debug('WARNING: ', msg);
  return log(style('bgYellow', 'black')(' WARNING '), msg);
};
export const warnWithNoTrace = (...args: unknown[]) => {
  const msg = util.format(...args);
  debug('WARNING: ', msg);
  return log(style('bgYellow', 'black')(' WARNING '), msg);
};

export const errorWithNoTrace = (...args: unknown[]) => {
  const msg = util.format(...args);
  debug('ERROR: ', msg);
  return log(style('bgRed', 'white')(' ERROR '), msg);
};

export const success = (...args: unknown[]) =>
  log(style('green', 'bold')(util.format(...args)));

export const error = (...args: unknown[]) => {
  const msg = util.format(...args);
  errors.push(msg);
  debug('ERROR: ', msg);
  return log(style('bgRed', 'white')(' ERROR '), msg);
};

export const title = (...args: unknown[]) =>
  info(style('blue', 'bold')(util.format(...args)));

export const titleContent = (...args: unknown[]) =>
  style('blue', 'bold')(util.format(...args));

export const divider = () => console.log('\n' + dividerContent() + '\n');

export const dividerContent = () => style('dim')(Array(64).fill('=').join(''));

export const blockStart = (label = '', lineLength = 64) => {
  const _label = ` start of ${label ?? 'block'} `;
  const padding = Math.max(lineLength - _label.length, 0) / 2;
  const padStart = Math.floor(padding);
  const padEnd = Math.ceil(padding);

  return style('dim')(
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

  return style('dim')(
    `${Array(padStart).fill('-').join('')}${_label}${Array(padEnd)
      .fill('-')
      .join('')}`
  );
};

export const spacer = (n: number = 2) =>
  console.log(Array(n).fill('').join('\n'));

export const cyan = style('cyan');
export const blue = style('blueBright');
export const red = style('red');
export const yellow = style('yellow');
export const green = style('green');
export const gray = style('gray');
export const white = style('white');
export const black = style('black');
export const magenta = style('magenta');
export const dim = style('dim');
export const bold = style('bold');
