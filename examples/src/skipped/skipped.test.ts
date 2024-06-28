describe.skip("skipped block", () => {
  it("test inside skipped block", () => {
    expect(1).toBe(1);
  }, 5000);
});
