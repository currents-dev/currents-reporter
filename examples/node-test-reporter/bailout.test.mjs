import test from 'node:test';
import assert from 'node:assert';

test('runs fine', () => {
  assert.ok(true);
});

test('should trigger bailout', () => {
  process.exit(1);
});
