import test from 'node:test';

// Error during declaration (outside test block)
throw new Error('Declaration error');

test('test that never runs', () => {
  // Will be skipped due to error above
});
