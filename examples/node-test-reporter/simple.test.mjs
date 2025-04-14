import assert from 'node:assert';
import { describe, test } from 'node:test';

test('Math operations - addition', () => {
  const result = 2 + 3;
  assert.strictEqual(result, 5);
});

test('Math operations - subtraction', () => {
  const result = 5 - 3;
  assert.strictEqual(result, 2);
});

test('Math operations - multiplication', () => {
  const result = 2 * 3;
  assert.strictEqual(result, 6);
});

test('Math operations - division', () => {
  const result = 6 / 3;
  assert.strictEqual(result, 2);
});

test('Math operations - division by zero', () => {
  const result = 6 / 0;
  assert.strictEqual(result, Infinity);
});

test('Math operations - incorrect addition', (t) => {
  const result = 2 + 2;
  t.test('should return 5', () => {
    assert.strictEqual(result, 5);
  })
  assert.strictEqual(result, 5);
});
