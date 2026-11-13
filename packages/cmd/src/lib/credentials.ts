import _ from 'lodash';

const KEY_FIELDS = ['apiKey', 'recordKey', 'key', 'subject_token', 'token'];

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
