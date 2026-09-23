jest.retryTimes(2);

let flakyRuns = 0;
let sameTitleRuns = 0;

describe('retries', () => {
  it('passes on the second attempt', () => {
    expect(flakyRuns++).toBe(1);
  });

  it('fails every attempt', () => {
    expect('always').toBe('never');
  });

  it('shares a title', () => {
    expect(sameTitleRuns++).toBe(2);
  });

  it.skip('shares a title', () => {});

  it('shares a title', () => {
    expect(1).toBe(1);
  });
});
