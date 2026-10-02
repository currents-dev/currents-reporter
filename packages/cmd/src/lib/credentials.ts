import _ from 'lodash';

const KEY_FIELDS = ['apiKey', 'recordKey', 'key'];

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
