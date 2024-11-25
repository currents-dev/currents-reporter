jest.retryTimes(2);
let j = 0;
describe('Flaky', () => {
  it('should pass only on second run', async () => {
    expect(j++).toEqual(1);
  });

  it('AAA', async () => {
    expect(1).toEqual(1);
  });
});
