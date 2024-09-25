import { Config } from '@jest/types';
import { ReportConfig } from '../../types';
import { FullTestSuite } from '../types';
import { jestScanner } from './scanner';
import { Scanner } from '../scanner';

export class JestScanner extends Scanner {
  constructor(config: ReportConfig) {
    super(config);
  }

  async getFullTestSuite(): Promise<FullTestSuite> {
    return jestScanner(
      this.config.frameworkConfig as Config.GlobalConfig,
      this.config.cliArgs
    );
  }
}
