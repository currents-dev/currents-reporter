import { sum } from "./sum";

test("[failed] adds 1 + 2 to equal 3", () => {
  expect(sum(1, 2)).toBe(4);
});
