describe('strings', () => {
  it('joins', () => {
    expect(['a', 'b'].join('-')).toBe('a-b');
  });

  it('splits', () => {
    expect('a-b'.split('-')).toEqual(['a', 'b']);
  });
});
