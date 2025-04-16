import test from 'node:test';

test(
  'this will timeout',
  async () => {
    await new Promise(() => {});
  },
  { timeout: 100 }
);
