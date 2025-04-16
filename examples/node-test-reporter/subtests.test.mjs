import assert from 'node:assert';
import { test } from 'node:test';

// Basic Subtest Structure
test('Main test with subtests', async (t) => {
  await t.test('adds numbers', () => {
    assert.strictEqual(1 + 2, 3);
  });

  await t.test('subtracts numbers', () => {
    assert.strictEqual(5 - 2, 3);
  });
});

// Looped Subtests (Table-driven)
test('Table-driven cases', async (t) => {
  const cases = [
    { a: 1, b: 2, expected: 3 },
    { a: 4, b: 5, expected: 9 },
  ];

  for (const { a, b, expected } of cases) {
    await t.test(`adds ${a} + ${b} = ${expected}`, () => {
      assert.strictEqual(a + b, expected);
    });
  }
});

// Nested Subtests
test('User actions', async (t) => {
  await t.test('Login', async (t) => {
    await t.test('with correct credentials', () => {
      assert.strictEqual(true, true);
    });

    await t.test('with wrong credentials', () => {
      assert.strictEqual(false, false);
    });
  });

  await t.test('Logout', () => {
    assert.ok(true);
  });
});

// Async Subtests
test('Async data fetch', async (t) => {
  await t.test('simulated fetch', async () => {
    const fakeFetch = () =>
      new Promise((res) => setTimeout(() => res('data'), 10));
    const result = await fakeFetch();
    assert.strictEqual(result, 'data');
  });
});

// Using Options (concurrent, skip, todo)
test('Options demo', async (t) => {
  await t.test('concurrent test', { concurrent: true }, async () => {
    assert.ok(true);
  });

  await t.test('this is skipped', { skip: true }, () => {
    throw new Error('Should be skipped');
  });

  await t.test('this is not a TODO'); // No function, not a todo
  await t.test('this is a TODO', { todo: true }); // No function, marked as todo
});

// Shared Setup in Parent Test
test('Setup example', async (t) => {
  const sharedValue = 42;

  await t.test('uses sharedValue', () => {
    assert.strictEqual(sharedValue, 42);
  });

  await t.test('still has access', () => {
    assert.ok(sharedValue > 0);
  });
});

// Fail Early (Manual aborting)
test('Early exit example', async (t) => {
  const shouldContinue = false;

  await t.test('initial check', () => {
    assert.strictEqual(true, true);
  });

  if (!shouldContinue) {
    console.log('Skipping remaining tests due to failure condition');
    return;
  }

  await t.test('this will be skipped', () => {
    assert.ok(false); // won't run
  });
});
