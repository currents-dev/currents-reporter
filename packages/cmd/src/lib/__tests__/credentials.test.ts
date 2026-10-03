import { describe, expect, it } from 'vitest';
import { maskKeys, maskSensitiveFields } from '../credentials';

describe('maskSensitiveFields', () => {
  it.each([
    [
      { apiKey: 'secret', name: 'John' },
      ['apiKey'],
      { apiKey: '*****', name: 'John' },
    ],
    [{ name: 'John', age: 25 }, ['apiKey'], { name: 'John', age: 25 }],
    [null, ['apiKey'], null],
    ['text', ['apiKey'], 'text'],
  ])('masks %j', (payload, fields, expected) => {
    expect(maskSensitiveFields(payload, fields)).toEqual(expected);
  });

  it('masks nested objects and leaves arrays as they are', () => {
    const instances = [{ recordKey: 'in-array' }];
    expect(
      maskSensitiveFields(
        { config: { currents: { recordKey: 'nested' } }, instances },
        ['recordKey']
      )
    ).toEqual({ config: { currents: { recordKey: '*****' } }, instances });
  });

  it('leaves an undefined field undefined', () => {
    expect(maskSensitiveFields({ apiKey: undefined }, ['apiKey'])).toEqual({
      apiKey: undefined,
    });
  });
});

describe('maskKeys', () => {
  it('masks API keys and record keys', () => {
    expect(
      maskKeys({ apiKey: 'a', recordKey: 'r', key: 'k', projectId: 'p' })
    ).toEqual({
      apiKey: '*****',
      recordKey: '*****',
      key: '*****',
      projectId: 'p',
    });
  });
});
