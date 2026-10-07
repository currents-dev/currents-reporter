import { isEmptyTestSuite } from '../fullTestSuite';

describe('isEmptyTestSuite', () => {
  const project = (tests: number) => ({
    name: 'root',
    tags: [],
    tests: Array.from({ length: tests }, (_, i) => ({
      title: [`test ${i}`],
      spec: 'a.test.js',
      tags: [],
      testId: String(i),
    })),
  });

  it('is true without projects or with a project without tests', () => {
    expect(isEmptyTestSuite([])).toBe(true);
    expect(isEmptyTestSuite([project(1), project(0)])).toBe(true);
  });

  it('is false when every project has tests', () => {
    expect(isEmptyTestSuite([project(1), project(2)])).toBe(false);
  });
});
