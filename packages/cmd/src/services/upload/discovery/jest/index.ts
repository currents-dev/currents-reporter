import { debug as _debug } from '@debug';
import { warn } from '@logger';
import { InstanceReport } from '../../../../types';
import { ReportConfig } from '../../types';
import { Scanner } from '../scanner';
import { FullTestSuite } from '../types';
import { addTestsFromResults, fullTestSuiteFromResults } from './fromResults';
import { jestScanner } from './scanner';

const debug = _debug.extend('jest-discovery');

export class JestScanner extends Scanner {
  constructor(
    config: ReportConfig,
    private instances: InstanceReport[]
  ) {
    super(config);
  }

  async getFullTestSuite(): Promise<FullTestSuite> {
    // Only a shard lacks tests of the suite in its results: the other shards
    // ran them. Jest runs again to list them.
    if (!this.config.frameworkConfig?.shard) {
      debug('Not a sharded run, listing the tests of the results');
      return fullTestSuiteFromResults(this.instances);
    }

    const { fullTestSuite, specsWithoutResults } = await jestScanner(
      this.config.cliArgs,
      { detox: this.config.frameworkConfig.originFramework === 'detox' }
    );
    if (specsWithoutResults.length === 0) {
      return fullTestSuite;
    }

    for (const { spec, message } of specsWithoutResults) {
      warn('Discovery could not load %s: %s', spec, getErrorLine(message));
    }
    const specsNotInResults = addTestsFromResults(
      fullTestSuite,
      specsWithoutResults,
      this.instances
    );
    warn(
      'The tests of these files are listed from the results of the shard that ran them. Currents can show the run as finished before the other shards upload.'
    );
    debug('Files that did not run on this shard: %o', specsNotInResults);

    return fullTestSuite;
  }
}

// Jest's failure message starts with a "● Test suite failed to run" header.
function getErrorLine(failureMessage: string) {
  return (
    failureMessage
      .split('\n')
      .map((line) => line.trim())
      .find((line) => line && !line.startsWith('●')) ?? ''
  );
}
