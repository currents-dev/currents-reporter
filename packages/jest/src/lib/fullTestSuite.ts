import { Config } from '@jest/types';
import fs from 'fs-extra';
import { join } from 'path';
import { debug } from './debug';
import { getDefaultProjectId } from './test';

export const FULL_TEST_SUITE_FILE = 'fullTestSuite.json';

export type FullSuiteTest = {
  title: string[];
  spec: string;
  tags: string[];
  testId: string;
};

export type FullSuiteProject = {
  name: string;
  tags: string[];
  tests: FullSuiteTest[];
};

export type FullTestSuite = FullSuiteProject[];

/**
 * `currents upload` otherwise discovers the test suite by running Jest a second
 * time, which under Detox boots a device and needs a resolvable Detox
 * configuration. The reporter already saw every test, so it writes the file
 * itself - unless Jest ran a subset, where what it saw is not the full suite.
 */
export async function writeFullTestSuite(
  reportDir: string,
  fullTestSuite: FullTestSuite
) {
  const filePath = join(reportDir, FULL_TEST_SUITE_FILE);
  await fs.writeFile(filePath, JSON.stringify(fullTestSuite), 'utf8');
  debug('Full test suite written to %s: %o', filePath, fullTestSuite);

  return filePath;
}

export function isPartialRun(globalConfig: Config.GlobalConfig): boolean {
  const config = globalConfig as Config.GlobalConfig & {
    testPathPattern?: string;
    testPathPatterns?: string[];
  };

  return Boolean(
    config.shard ||
    config.onlyFailures ||
    config.testNamePattern ||
    config.testPathPattern ||
    config.testPathPatterns?.length ||
    config.findRelatedTests
  );
}

export function getTestTags(title: string[]): string[] {
  const tags = title.join(' ').match(/@(\S+)/g) ?? [];

  return Array.from(new Set(tags.map((tag) => tag.trim().replace('@', ''))));
}

/**
 * The discovery reporter in @currents/cmd renames a single project named after
 * the generated Jest config id, so the group of the run reads `root` instead of
 * a hash. Matched here to keep both paths producing the same group.
 */
export function withDefaultProjectName(
  fullTestSuite: FullTestSuite,
  configIds: string[]
): FullTestSuite {
  if (
    fullTestSuite.length !== 1 ||
    !configIds.includes(fullTestSuite[0].name)
  ) {
    return fullTestSuite;
  }

  return [{ ...fullTestSuite[0], name: getDefaultProjectId() }];
}
