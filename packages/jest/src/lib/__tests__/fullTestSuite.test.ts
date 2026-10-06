import type { AggregatedResult } from '@jest/reporters';
import { Config } from '@jest/types';
import { isIncompleteRun, isPartialRun } from '../fullTestSuite';

const jest29Config = (overrides: Record<string, unknown> = {}) =>
  ({ testPathPattern: '', ...overrides }) as unknown as Config.GlobalConfig;

const jest30Config = (patterns: string[]) =>
  ({ testPathPatterns: { patterns } }) as unknown as Config.GlobalConfig;

describe('isPartialRun', () => {
  it('is false for a run of every test', () => {
    expect(isPartialRun(jest29Config(), {})).toBe(false);
    expect(isPartialRun(jest30Config([]), {})).toBe(false);
  });

  it('is true for a run filtered by test path', () => {
    expect(isPartialRun(jest29Config({ testPathPattern: 'login' }), {})).toBe(
      true
    );
    expect(isPartialRun(jest30Config(['login']), {})).toBe(true);
  });

  it.each([
    { shard: { shardIndex: 1, shardCount: 2 } },
    { onlyFailures: true },
    { onlyChanged: true },
    { changedSince: 'main' },
    { lastCommit: true },
    { findRelatedTests: true },
    { testNamePattern: 'login' },
  ])('is true for %o', (overrides) => {
    expect(isPartialRun(jest29Config(overrides), {})).toBe(true);
  });

  it.each([{ selectProjects: ['e2e'] }, { ignoreProjects: ['e2e'] }])(
    'is true for argv %o',
    (argv) => {
      expect(isPartialRun(jest29Config(), argv)).toBe(true);
    }
  );
});

describe('isIncompleteRun', () => {
  const result = (overrides: Partial<AggregatedResult>) =>
    ({
      numTotalTestSuites: 3,
      numPassedTestSuites: 1,
      numFailedTestSuites: 1,
      numPendingTestSuites: 1,
      wasInterrupted: false,
      ...overrides,
    }) as AggregatedResult;

  it('is false when every test file finished', () => {
    expect(isIncompleteRun(result({}))).toBe(false);
  });

  it('is true when --bail stopped the run', () => {
    expect(isIncompleteRun(result({ numPendingTestSuites: 0 }))).toBe(true);
  });

  it('is true when the run was interrupted', () => {
    expect(isIncompleteRun(result({ wasInterrupted: true }))).toBe(true);
  });
});
