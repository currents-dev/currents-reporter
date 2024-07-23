describe("Test with @tag", () => {
  test("Test A @tagA", () => {
    expect(1).toBe(1);
  });

  test.skip("Test B @tagB", () => {
    expect(1).toBe(1);
  });
});
