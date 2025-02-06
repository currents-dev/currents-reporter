import { debug as _debug } from '@debug';
import { dim, error } from '@logger';
import fs from 'fs-extra';
import { getFullTestSuiteFilePath } from '../../../../services/upload/path';

const debug = _debug.extend('junit-discovery');

export async function jUnitScanner(reportDir: string) {
  console.time(dim('@currents/junit:fullTestSuite-ready'));

  try {
    debug('running scanner: %o', reportDir);

    const fullTestSuitePath = getFullTestSuiteFilePath(reportDir);

    process.env.CURRENTS_DISCOVERY_PATH = fullTestSuitePath;

    const fileContent = fs.readFileSync(fullTestSuitePath, 'utf-8');

    return JSON.parse(fileContent);
  } catch (err) {
    error('Failed to obtain the junit full test suite:', err);
    return [];
  }
}
