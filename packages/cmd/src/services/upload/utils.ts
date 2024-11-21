import { InstanceReport } from 'types';

export function parseDangerousProperties(report: InstanceReport) {
  report.results.stats.wallClockDuration = Math.round(
    report.results.stats.wallClockDuration
  );
  report.results.tests.forEach((test) => {
    test.attempts.forEach((attempt) => {
      attempt.duration = Math.round(attempt.duration);
    });
  });
  return report;
}
