
describe('Artifacts Test', () => {
  it('should generate stdout and stderr', () => {
    console.log('This is a stdout message from the test');
    console.error('This is a stderr message from the test');
    expect(true).toBe(true);
  });
});
