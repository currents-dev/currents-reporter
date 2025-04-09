import { describe, it } from 'node:test';
import assert from 'node:assert';

describe('Basic Tests', () => {
  it('should pass', () => {
    assert.strictEqual(1 + 1, 2);
  });

  it('should fail', () => {
    assert.strictEqual(1 + 1, 3);
  });
});

describe('Nested Tests', () => {
  describe('Nested Test 1', () => {
    it('should pass', () => {
      assert.strictEqual(1 + 1, 2);
    });

    describe('Nested Test 2', () => {
      it('should pass', () => {
        assert.strictEqual(1 + 1, 2);
      });

      it('should "fail"', () => {
        assert.strictEqual(1 + 1, 3);
      });
    });
  });
});
