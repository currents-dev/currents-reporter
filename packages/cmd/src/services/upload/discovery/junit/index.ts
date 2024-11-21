import { ReportConfig } from '../../types';
import { Scanner } from '../scanner';
import { FullTestSuite } from '../types';
import { jUnitScanner } from './scanner';

export class JUnitScanner extends Scanner {
  private reportDir: string;

  constructor(config: ReportConfig, reportDir: string) {
    super(config);
    this.reportDir = reportDir;
  }

  async getFullTestSuite(): Promise<FullTestSuite> {
    return jUnitScanner(this.reportDir);
  }
}
