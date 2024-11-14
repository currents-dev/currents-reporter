import { ReportConfig } from '../types';
import { JestScanner } from './jest';
import { JUnitScanner } from './junit';
import { Scanner } from './scanner';

export function createScanner(config: ReportConfig): Scanner {
  switch (config.framework) {
    case 'jest':
      return new JestScanner(config);
    case 'junit':
      return new JUnitScanner(config);

    default:
      return new Scanner(config);
  }
}
