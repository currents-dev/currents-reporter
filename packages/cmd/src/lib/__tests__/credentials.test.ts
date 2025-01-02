import { describe, expect, it } from 'vitest';
import { maskApiKey, maskRecordKey, maskSensitiveFields } from '../credentials';

type Payload = Record<string, unknown> | null;

describe('maskSensitiveFields', () => {
  it.each([
    [
      { apiKey: 'secret', name: 'John' },
      ['apiKey'],
      { apiKey: '*****', name: 'John' },
    ],
    [
      { recordKey: 'key123', name: 'Doe' },
      ['recordKey'],
      { recordKey: '*****', name: 'Doe' },
    ],
    [{ key: 'myKey', age: 30 }, ['key'], { key: '*****', age: 30 }],
    [{ name: 'John', age: 25 }, ['apiKey'], { name: 'John', age: 25 }],
    [null, ['apiKey'], null],
  ])(
    'masks secrets correctly for payload %j and secrets %j',
    (payload, secrets, expected) => {
      const result = maskSensitiveFields(payload as Payload, secrets);
      expect(result).toEqual(expected);
    }
  );
});

describe('maskApiKey', () => {
  it.each([
    [
      { apiKey: 'secretKey', name: 'Alice' },
      { apiKey: '*****', name: 'Alice' },
    ],
    [
      { name: 'Bob', age: 22 },
      { name: 'Bob', age: 22 },
    ],
    [null, null],
  ])('masks apiKey for payload %j', (payload, expected) => {
    const result = maskApiKey(payload as Payload);
    expect(result).toEqual(expected);
  });
});

describe('maskRecordKey', () => {
  it.each([
    [
      { recordKey: 'rec123', key: 'myKey', name: 'Tom' },
      { recordKey: '*****', key: '*****', name: 'Tom' },
    ],
    [
      { name: 'Jerry', age: 20 },
      { name: 'Jerry', age: 20 },
    ],
    [null, null],
  ])('masks recordKey and key for payload %j', (payload, expected) => {
    const result = maskRecordKey(payload as Payload);
    expect(result).toEqual(expected);
  });
});
