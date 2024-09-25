describe("describe block 1", () => {
  it("expect 1 to match 1", () => {
    expect(1).toBe(1);
  });

  it.todo("todo test");

  it.skip("skipped test case", () => {
    expect(2).toBe(2);
  });
});

describe.skip("skipped describe block", () => {
  it("expect 3 to match 3", () => {
    expect(3).toBe(3);
  });

  it("expect 4 to match 4", () => {
    expect(4).toBe(4);
  });
});
