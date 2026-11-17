import { format, inspect } from 'node:util';

const hex = (char: string, width: number, upper: boolean) => {
  const value = char.charCodeAt(0).toString(16).padStart(width, '0');
  return upper ? value.toUpperCase() : value;
};
const percent = (char: string, upper = false) => `%${hex(char, 2, upper)}`;
const jsonEscape = (char: string, upper = false) => `\\u${hex(char, 4, upper)}`;

/**
 * The ways a server can repeat a secret: as it is, URL-encoded in part or in
 * full, with JSON \u escapes (a backslash on the wire), in another case, and
 * all of them mixed in one string.
 */
export function reflections(secret: string) {
  const chars = Array.from(secret);
  const third = Math.ceil(chars.length / 3);
  return [
    secret,
    encodeURIComponent(secret),
    chars.map((c, i) => (i % 2 ? percent(c) : c)).join(''),
    chars.map((c) => percent(c)).join(''),
    chars.map((c) => percent(c, true)).join(''),
    chars.map((c) => jsonEscape(c)).join(''),
    chars.map((c) => jsonEscape(c, true)).join(''),
    secret.toUpperCase(),
    secret.toLowerCase(),
    chars.map((c, i) => (i % 2 ? c.toUpperCase() : c.toLowerCase())).join(''),
    chars
      .map((c, i) =>
        i < third ? c : i < 2 * third ? percent(c, true) : jsonEscape(c)
      )
      .join(''),
  ];
}

/** Decodes \u escapes (however many backslashes) and %XX, and lowercases. */
function normalize(text: string) {
  return text
    .replace(/\\+u([0-9a-f]{4})/gi, (_m, code: string) =>
      String.fromCharCode(parseInt(code, 16))
    )
    .replace(/%([0-9a-f]{2})/gi, (_m, code: string) =>
      String.fromCharCode(parseInt(code, 16))
    )
    .toLowerCase();
}

/** The secrets that the text holds in any spelling. */
export function leakedSecrets(text: string, secrets: string[]) {
  const normalized = normalize(text);
  return secrets.filter((secret) => normalized.includes(secret.toLowerCase()));
}

/** How a debug line or a log prints an error object. */
export function dumps(value: unknown) {
  return [
    inspect(value, { depth: null }),
    format('%o', value),
    format('%O', value),
  ].join('\n');
}
