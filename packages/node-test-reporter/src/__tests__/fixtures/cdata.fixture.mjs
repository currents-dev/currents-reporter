import assert from 'node:assert';
import { test } from 'node:test';

test('cdata end ]]> in name and actual value', () => {
  assert.strictEqual('before ]]> after ]]>', ']]>');
});
