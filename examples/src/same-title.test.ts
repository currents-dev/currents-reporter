jest.retryTimes(2);

describe('Test cases with same title', () => {
  let j = 0;

  test('Test case example', () => {
    expect(j++).toBe(2);
  });

  test.skip('Test case example', () => {
    expect(1).toBe(1);
  });

  test('Test case example', () => {
    expect(1).toBe(1);
  });
});
