import path from 'path';

export function getFullTestSuiteFilePath(reportDir: string) {
  return path.join(reportDir, 'fullTestSuite.json');
}
