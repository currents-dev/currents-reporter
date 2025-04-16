import assert from 'node:assert';
import { describe, test } from 'node:test';

describe('Math Operations', () => {
  describe('Addition', () => {
    test('should return 5 when adding 2 and 3', () => {
      assert.strictEqual(2 + 3, 5);
    });

    test('should return 0 when adding -1 and 1', () => {
      assert.strictEqual(-1 + 1, 0);
    });
  });

  describe('Subtraction', () => {
    test('should return 1 when subtracting 3 from 4', () => {
      assert.strictEqual(4 - 3, 1);
    });

    test('should return -2 when subtracting 3 from 1', () => {
      assert.strictEqual(1 - 3, -2);
    });
  });

  describe('Multiplication', () => {
    test('should return 6 when multiplying 2 and 3', () => {
      assert.strictEqual(2 * 3, 6);
    });

    test('should return 0 when multiplying any number by 0', () => {
      assert.strictEqual(5 * 0, 0);
    });
  });

  describe('Division', () => {
    test('should return 2 when dividing 6 by 3', () => {
      assert.strictEqual(6 / 3, 2);
    });

    test('should throw an error when dividing by 0', () => {
      assert.throws(() => {
        const result = 6 / 0;
      }, /Infinity/);
    });
  });
});
