import assert from 'node:assert';
import { before, describe, it, test } from 'node:test';

test('strictEqual numbers', () => {
  assert.strictEqual(1, 2);
});
test('deepStrictEqual objects', () => {
  assert.deepStrictEqual(
    { a: 1, b: [1, 2, 3], c: 'x' },
    { a: 1, b: [1, 2, 4], c: 'y' }
  );
});
test('assert.ok with message', () => {
  assert.ok(false, 'custom & <message>');
});
test('multi-line message', () => {
  throw new Error('line one\nline two\n  line three');
});
test('error with custom props and cause', () => {
  const err = new Error('outer', { cause: new TypeError('inner cause') });
  err.code = 'E_CUSTOM';
  err.details = { nested: [1, 'two', null] };
  throw err;
});
test('error with a multi-line stack', () => {
  const err = new Error('has stack');
  Object.defineProperty(err, 'stack', {
    enumerable: true,
    value: [
      'Error: has stack',
      '    at fn (file:///project/test.mjs:10:11)',
      '    at next (node:internal/test_runner/test:1:1)',
    ].join('\n'),
  });
  throw err;
});
test('throws a string', () => {
  throw 'plain string';
});
test('throws a number', () => {
  throw 42;
});
test('throws an object', () => {
  throw { reason: 'object', n: 1 };
});
test('throws null', () => {
  throw null;
});
test('throws undefined', () => {
  throw undefined;
});
test('rejects', async () => {
  await Promise.reject(new RangeError('rejected'));
});
test('times out', { timeout: 20 }, async () => {
  await new Promise((r) => setTimeout(r, 200));
});
describe('suite with failing hook', () => {
  before(() => {
    throw new Error('hook failed');
  });
  it('not run because the hook failed', () => {});
});
describe('suite with failing child', () => {
  it('child fails', () => {
    assert.equal('a', 'b');
  });
  it('child passes', () => {});
});
test('parent passes, subtest fails', async (t) => {
  await t.test('failing subtest', () => {
    assert.fail('subtest failure');
  });
});
