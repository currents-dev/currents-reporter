import { InstanceReport } from '../../../../types';
import { FullSuiteTest, FullTestSuite } from '../types';
import { getDefaultProjectId, getTestTags } from './utils/test';

// Jest names a project without displayName after its config id, 32 hex
// characters. The discovery reporter and @currents/jest rename a single
// project with such a name to `root`.
const GENERATED_PROJECT_ID = /^[0-9a-f]{32}$/;

/**
 * The results hold every test of each file Jest ran, also the tests that
 * --testNamePattern skipped (reported as pending). For a run that is not
 * sharded, this is the list a discovery run returns.
 */
export function fullTestSuiteFromResults(
  instances: InstanceReport[]
): FullTestSuite {
  const fullTestSuite: FullTestSuite = [];

  for (const instance of instances) {
    let project = fullTestSuite.find((p) => p.name === instance.groupId);
    if (!project) {
      project = { name: instance.groupId, tags: [], tests: [] };
      fullTestSuite.push(project);
    }
    project.tests.push(...getInstanceTests(instance));
  }

  if (
    fullTestSuite.length === 1 &&
    GENERATED_PROJECT_ID.test(fullTestSuite[0].name)
  ) {
    fullTestSuite[0].name = getDefaultProjectId();
  }

  return fullTestSuite;
}

/**
 * Adds the tests of the files that discovery could not load, from the results
 * of this shard. Returns the files that did not run on this shard: the shard
 * that ran them adds their tests when it uploads.
 */
export function addTestsFromResults(
  fullTestSuite: FullTestSuite,
  specs: { projectId: string; spec: string }[],
  instances: InstanceReport[]
): string[] {
  const specsNotInResults: string[] = [];

  for (const { projectId, spec } of specs) {
    // Projects can share spec paths. The id of a single project can differ
    // between discovery and the results: discovery of a Detox project runs a
    // rewritten config.
    const instance =
      instances.find((i) => i.spec === spec && i.groupId === projectId) ??
      (fullTestSuite.length === 1
        ? instances.find((i) => i.spec === spec)
        : undefined);
    if (!instance) {
      specsNotInResults.push(spec);
      continue;
    }

    let project =
      fullTestSuite.length === 1
        ? fullTestSuite[0]
        : fullTestSuite.find((p) => p.name === projectId);
    if (!project) {
      project = { name: projectId, tags: [], tests: [] };
      fullTestSuite.push(project);
    }
    project.tests.push(...getInstanceTests(instance));
  }

  return specsNotInResults;
}

function getInstanceTests(instance: InstanceReport): FullSuiteTest[] {
  return instance.results.tests.map((test) => ({
    spec: instance.spec,
    testId: test.testId,
    title: test.title,
    tags: test.tags ?? getTestTags(test.title),
  }));
}
