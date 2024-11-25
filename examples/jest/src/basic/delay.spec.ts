describe('delay', () => {
  test('example test', async () => {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    expect(true).toBe(true);
  });
});
