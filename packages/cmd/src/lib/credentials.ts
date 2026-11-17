import _ from 'lodash';

const KEY_FIELDS = [
  'apiKey',
  'recordKey',
  'key',
  'subject_token',
  'token',
  'oidcToken',
  'oidcApiToken',
  'access_token',
];

/**
 * A copy of the payload with the fields replaced by '*****', in nested
 * objects too: the run creation payload holds the record key in
 * `config.currents.recordKey`. Arrays are left as they are, so that a debug
 * line does not copy every instance of a run.
 */
export function maskSensitiveFields<T>(payload: T, fields: string[]): T {
  if (!_.isPlainObject(payload)) return payload;

  return _.mapValues(payload as Record<string, unknown>, (value, name) =>
    fields.includes(name) && value !== undefined
      ? '*****'
      : maskSensitiveFields(value, fields)
  ) as T;
}

/** Use it on every config, options object or request that a debug line prints. */
export function maskKeys<T>(payload: T): T {
  return maskSensitiveFields(payload, KEY_FIELDS);
}

/**
 * A copy of a form-encoded body with the key fields replaced by '*****'. A
 * body without them is returned as it is.
 */
export function maskFormBody(body: string) {
  const params = new URLSearchParams(body);
  const found = KEY_FIELDS.filter((field) => params.has(field));
  if (found.length === 0) return body;
  found.forEach((field) => params.set(field, '*****'));
  return params.toString();
}

/**
 * One character of a secret as a pattern: the character, its
 * percent-encoding, or its JSON \u escape. A server's answer can hold any of
 * them, and each decodes to the secret.
 */
function secretCharPattern(char: string) {
  const code = char.charCodeAt(0);
  const percent =
    code < 0x80
      ? `%${code.toString(16).padStart(2, '0')}`
      : _.escapeRegExp(encodeURIComponent(char));
  return `(?:${_.escapeRegExp(char)}|${percent}|\\\\u${code.toString(16).padStart(4, '0')})`;
}

/** The text with the secret, in any of its encodings, replaced by '*****'. */
export function redactSecret(text: string, secret: string) {
  if (!secret) return text;
  const pattern = new RegExp(
    Array.from(secret, secretCharPattern).join(''),
    'gi'
  );
  return text.replace(pattern, '*****');
}

/**
 * A copy of the value with the secrets redacted in every string of it: keys
 * and values of objects, and items of arrays.
 */
export function redactSecretsDeep(value: unknown, secrets: string[]): unknown {
  const redact = (text: string) => secrets.reduce(redactSecret, text);
  if (typeof value === 'string') return redact(value);
  if (Array.isArray(value)) {
    return value.map((item) => redactSecretsDeep(item, secrets));
  }
  if (!_.isPlainObject(value)) return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, item]) => [
      redact(key),
      redactSecretsDeep(item, secrets),
    ])
  );
}

/**
 * The non-empty string values of the key fields, in nested objects and arrays
 * too: the run cancel and cache requests hold the record key in their body.
 */
export function collectKeyValues(payload: unknown): string[] {
  if (Array.isArray(payload)) return payload.flatMap(collectKeyValues);
  if (!_.isPlainObject(payload)) return [];
  return Object.entries(payload as Record<string, unknown>).flatMap(
    ([name, value]) =>
      KEY_FIELDS.includes(name) && typeof value === 'string'
        ? value
          ? [value]
          : []
        : collectKeyValues(value)
  );
}

const parseJson = (text: string): { value: unknown } | undefined => {
  try {
    return { value: JSON.parse(text) };
  } catch {
    return undefined;
  }
};

/**
 * The keys a request body carries: from an object, a JSON string, or a form
 * (every value of a repeated field). A Buffer is not read.
 */
export function collectBodyKeys(body: unknown): string[] {
  if (typeof body !== 'string') return collectKeyValues(body);
  const json = parseJson(body);
  if (json) return collectKeyValues(json.value);
  const params = new URLSearchParams(body);
  return KEY_FIELDS.flatMap((field) => params.getAll(field)).filter(Boolean);
}

/**
 * A request body to print: the key fields masked, and the secrets replaced
 * wherever else they are. A Buffer, such as a gzipped body, is not printed.
 */
export function bodyForDiagnostics(body: unknown, secrets: string[]): unknown {
  if (Buffer.isBuffer(body)) return '<binary body>';
  if (typeof body === 'string') {
    const json = parseJson(body);
    const masked = json
      ? JSON.stringify(maskKeys(json.value))
      : maskFormBody(body);
    return redactSecretsDeep(masked, secrets);
  }
  return redactSecretsDeep(maskKeys(body), secrets);
}
