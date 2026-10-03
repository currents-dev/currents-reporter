import { InvalidArgumentError, Option } from '@commander-js/extra-typings';
import {
  ApiRequestOptions,
  Field,
  handleApiRequest,
} from '../../services/api/request';
import { commandHandler, printLogsToStderr } from '../utils';

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD'];

function splitPair(value: string, separator: string): Field {
  const index = value.indexOf(separator);
  const key = index < 0 ? '' : value.slice(0, index).trim();
  if (!key) {
    throw new InvalidArgumentError(`Expected key${separator}value.`);
  }
  return [key, value.slice(index + 1).trim()];
}

/** A number only when JSON keeps it as written; 9007199254740993 stays a string. */
function typedValue(value: string) {
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (value === 'null') return null;
  if (/^-?\d+(\.\d+)?$/.test(value)) {
    const number = Number(value);
    const exact = value.includes('.')
      ? Number.isFinite(number)
      : Number.isSafeInteger(number);
    if (exact) return number;
  }
  return value;
}

const collectField = (value: string, previous: Field[] = []) => {
  const [key, raw] = splitPair(value, '=');
  return [...previous, [key, typedValue(raw as string)] as Field];
};

const collectRawField = (value: string, previous: Field[] = []) => [
  ...previous,
  splitPair(value, '='),
];

const collectHeader = (value: string, previous: Field[] = []) => [
  ...previous,
  splitPair(value, ':'),
];

export const methodOption = new Option(
  '-X, --method <method>',
  'the HTTP method; GET by default, POST when --field, --raw-field or --input is given'
).argParser((value) => {
  const method = value.toUpperCase();
  if (!METHODS.includes(method)) {
    throw new InvalidArgumentError(`Use one of ${METHODS.join(', ')}.`);
  }
  return method;
});

export const fieldOption = new Option(
  '-f, --field <key=value>',
  'a request parameter; repeat for more. Sent in the query string of a GET and in the JSON body otherwise. true, false, null and numbers are sent as JSON values; in a JSON body, key[]=value adds the value to an array'
).argParser(collectField);

export const rawFieldOption = new Option(
  '-F, --raw-field <key=value>',
  'like --field, but the value is always a string'
).argParser(collectRawField);

export const inputOption = new Option(
  '--input <file>',
  'send the JSON in this file as the body, or the JSON from stdin with "-"; fields then go to the query string'
);

export const headerOption = new Option(
  '-H, --header <key:value>',
  'an HTTP header to send; repeat for more'
).argParser(collectHeader);

export const includeOption = new Option(
  '-i, --include',
  'print the HTTP status line and the response headers before the body'
);

export async function apiRequestHandler(
  path: string,
  options: ApiRequestOptions
) {
  await commandHandler(async (opts) => {
    printLogsToStderr();
    await handleApiRequest(path, opts);
  }, options);
}
