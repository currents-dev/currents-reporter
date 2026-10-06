describe('math', () => {
  it('adds', () => {
    expect(1 + 1).toBe(2);
  });

  describe('nested', () => {
    it('multiplies @smoke', () => {
      expect(2 * 3).toBe(6);
    });
  });
});
