import test from 'node:test';
import assert from 'node:assert';

async function retry(fn, attempts = 3) {
  let lastError;
  for (let i = 0; i < attempts; i++) {
    try {
      await fn();
      return;
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
}

test('retrying flaky test', async () => {
  await retry(async () => {
    // Simulate a flaky assertion
    assert.ok(Math.random() > 0.7, 'Flaky check failed');
  }, 5);
});
