import { InstanceReport } from '../../../types';
import { ReportConfig } from '../types';
import { JestScanner } from './jest';
import { JUnitScanner } from './junit';
import { Scanner } from './scanner';

export function createScanner(
  config: ReportConfig,
  reportDir: string,
  instances: InstanceReport[]
): Scanner {
  switch (config.framework) {
    case 'jest':
      return new JestScanner(config, instances);
    case 'junit':
      return new JUnitScanner(config, reportDir);

    default:
      return new Scanner(config);
  }
}
