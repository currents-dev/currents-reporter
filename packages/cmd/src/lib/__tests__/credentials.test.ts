import { describe, expect, it } from 'vitest';
import {
  maskKeys,
  maskSensitiveFields,
  redactSecret,
  redactSecretsDeep,
} from '../credentials';

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

  it('masks the OIDC tokens and the exchange response, nested too', () => {
    expect(
      maskKeys({
        oidcToken: 'o',
        oidcApiToken: 'a',
        response: { access_token: 't', expires_in: 600 },
      })
    ).toEqual({
      oidcToken: '*****',
      oidcApiToken: '*****',
      response: { access_token: '*****', expires_in: 600 },
    });
  });
});

describe('redactSecret', () => {
  const SECRET = 'crnts_ciapi_x+1';

  it.each([
    ['as it is', `bad ${SECRET}.`],
    ['URL-encoded', `bad ${encodeURIComponent(SECRET)}.`],
    ['with a percent-encoded character', 'bad %63rnts%5fciapi_x%2B1.'],
    ['with a JSON \\u escape', 'bad \\u0063rnts_ciapi_x\\u002b1.'],
    ['in another case', `bad ${SECRET.toUpperCase()}.`],
  ])('replaces the secret %s', (_name, text) => {
    expect(redactSecret(text, SECRET)).toBe('bad *****.');
  });

  it('keeps other text and an empty secret', () => {
    expect(redactSecret('crnts_ciapi_y', SECRET)).toBe('crnts_ciapi_y');
    expect(redactSecret('text', '')).toBe('text');
  });
});

describe('redactSecretsDeep', () => {
  it('redacts the keys, values and items of nested values, and keeps the rest', () => {
    expect(
      redactSecretsDeep({ a: ['k1', 1, { k2: 'x k2 y' }], b: null, k1: true }, [
        'k1',
        'k2',
      ])
    ).toEqual({
      a: ['*****', 1, { '*****': 'x ***** y' }],
      b: null,
      '*****': true,
    });
  });
});
