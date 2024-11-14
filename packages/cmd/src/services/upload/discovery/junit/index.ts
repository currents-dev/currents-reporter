import { Config } from '@jest/types';
import { ReportConfig } from '../../types';
import { Scanner } from '../scanner';
import { FullTestSuite } from '../types';
import { jUnitScanner } from './scanner';

export class JUnitScanner extends Scanner {
  constructor(config: ReportConfig) {
    super(config);
  }

  async getFullTestSuite(): Promise<FullTestSuite> {
    return jUnitScanner(
      this.config.frameworkConfig as Config.GlobalConfig,
      this.config.cliArgs
    );
  }
}
