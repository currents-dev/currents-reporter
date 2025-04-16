import assert from 'node:assert';
import { describe, test } from 'node:test';

describe('Math Operations', () => {
  describe('Addition', () => {
    test('should return 4 when adding 2 + 2', () => {
      assert.strictEqual(2 + 2, 4);
    });

    test.skip('should return 0 when adding -2 + 2', () => {
      assert.strictEqual(-2 + 2, 0);
    });

    test.todo('should handle floating point addition');
  });

  describe.skip('Subtraction', () => {
    test('should return 0 when subtracting 2 - 2', () => {
      assert.strictEqual(2 - 2, 0);
    });

    test('should return -4 when subtracting 2 - 6', () => {
      assert.strictEqual(2 - 6, -4);
    });
  });

  describe.todo('Multiplication');

  describe('Division', () => {
    test('should return 2 when dividing 4 / 2', () => {
      assert.strictEqual(4 / 2, 2);
    });

    test('should throw an error when dividing by 0', () => {
      assert.throws(() => {
        const result = 4 / 0;
        if (!isFinite(result)) throw new Error('Division by zero');
      }, /Division by zero/);
    });
  });
});
