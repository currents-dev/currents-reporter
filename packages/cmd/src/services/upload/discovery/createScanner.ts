import { ReportConfig } from '../types';
import { JestScanner } from './jest';
import { JUnitScanner } from './junit';
import { Scanner } from './scanner';

export function createScanner(
  config: ReportConfig,
  reportDir: string
): Scanner {
  switch (config.framework) {
    case 'jest':
      return new JestScanner(config);
    case 'junit':
      return new JUnitScanner(config, reportDir);

    default:
      return new Scanner(config);
  }
}
