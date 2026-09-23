describe('basic', () => {
  it('passes', () => {
    expect(1).toBe(1);
  });

  it('fails', () => {
    expect(1).toBe(2);
  });

  it.skip('is skipped', () => {});

  it.todo('is a todo');

  describe('nested', () => {
    it('carries a tag @smoke', () => {
      expect(true).toBe(true);
    });
  });
});
