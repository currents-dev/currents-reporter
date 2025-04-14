import test from 'node:test';
import assert from 'node:assert';

test('hooks demo', async (t) => {
  await t.test(
    'with setup and teardown',
    {
      before: () => console.log('before hook'),
      after: () => console.log('after hook'),
    },
    () => {
      assert.strictEqual(1, 1);
    }
  );
});
