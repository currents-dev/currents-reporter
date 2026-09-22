import { InstanceReport, InstanceReportTest } from '../types';

/**
 * `detox test --retries` starts Jest again for the failed spec files, so a
 * second process writes the instance report of a spec the first one already
 * wrote. Jest numbers the attempts of each process from 0, hence the attempts
 * of the later run are appended after the ones already recorded rather than
 * replacing them.
 */
export function mergeInstanceReport(
  previous: InstanceReport,
  next: InstanceReport
): InstanceReport {
  const tests = new Map(
    previous.results.tests.map((test) => [test.testId, test])
  );

  next.results.tests.forEach((test) => {
    const existing = tests.get(test.testId);
    tests.set(test.testId, existing ? mergeTest(existing, test) : test);
  });

  const mergedTests = [...tests.values()];

  return {
    ...next,
    startTime: earliest(previous.startTime, next.startTime),
    results: {
      ...next.results,
      stats: {
        ...next.results.stats,
        suites: previous.results.stats.suites,
        tests: mergedTests.length,
        passes: countState(mergedTests, 'passed'),
        pending: countState(mergedTests, 'pending'),
        failures: countState(mergedTests, 'failed'),
        skipped: previous.results.stats.skipped + next.results.stats.skipped,
        flaky: mergedTests.filter((test) => test.isFlaky).length,
        wallClockStartedAt: earliest(
          previous.results.stats.wallClockStartedAt,
          next.results.stats.wallClockStartedAt
        ),
        wallClockEndedAt: latest(
          previous.results.stats.wallClockEndedAt,
          next.results.stats.wallClockEndedAt
        ),
        wallClockDuration:
          previous.results.stats.wallClockDuration +
          next.results.stats.wallClockDuration,
      },
      tests: mergedTests,
    },
  };
}

function mergeTest(
  previous: InstanceReportTest,
  next: InstanceReportTest
): InstanceReportTest {
  const offset = previous.attempts.length;
  const attempts = [
    ...previous.attempts,
    ...next.attempts.map((attempt, index) => ({
      ...attempt,
      attempt: offset + index,
    })),
  ];
  const states = attempts.map((attempt) => attempt._s);

  return {
    ...next,
    _t: Math.min(previous._t, next._t),
    retries: attempts.length,
    attempts,
    isFlaky: states.includes('failed') && states.includes('passed'),
  };
}

function countState(tests: InstanceReportTest[], state: string) {
  return tests.filter((test) => test.state === state).length;
}

function earliest(a: string, b: string) {
  return new Date(a) <= new Date(b) ? a : b;
}

function latest(a: string, b: string) {
  return new Date(a) >= new Date(b) ? a : b;
}
