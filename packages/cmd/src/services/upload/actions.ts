import {
  ACTION_ANNOTATIONS,
  ACTION_TYPE,
  Action,
  RuleMatchable,
  RuleTrace,
  RulesEvalBase,
  normalizeTagMatcherValue,
} from '@currents/rules';
import { debug as _debug } from '@debug';
import { Commit } from '@env/gitInfo';
import { info, warn } from '@logger';
import { getProjectActions } from '../../api';
import { InstanceReport, InstanceReportTest } from '../../types';
import { FullTestSuite } from './discovery';

const debug = _debug.extend('actions');

// The API keeps up to 2048 characters of an annotation description
const MAX_ACTION_NAME_LENGTH = 512;

export type AppliedActionsSummary = {
  skipped: number;
  quarantined: number;
  tagged: number;
};

/**
 * The active actions of the project, or none when the API can't be reached:
 * the results are uploaded without actions rather than not at all.
 */
export async function fetchProjectActions(
  projectId: string,
  recordKey: string
): Promise<Action[]> {
  try {
    const actions = await getProjectActions(projectId, recordKey);
    if (!Array.isArray(actions)) {
      throw new Error('The project actions are not a list');
    }
    debug('Fetched %d project actions', actions.length);
    return actions;
  } catch (err) {
    warn('Failed to fetch the project actions, uploading without them');
    debug('Failed to fetch the project actions: %o', err);
    return [];
  }
}

/**
 * Applies the matching actions to the results before they are uploaded, the
 * way @currents/playwright applies them while the tests run. The tests already
 * ran, so the attempts keep their results:
 * - skip marks the test as skipped
 * - quarantine marks a failed test as skipped
 * - tag adds the tags to the test
 * Each applied action adds the annotation the dashboard shows it with.
 */
export function applyProjectActions({
  actions,
  instances,
  fullTestSuite,
  gitInfo,
  runTags,
  disableTitleTags = false,
  group,
}: {
  actions: Action[];
  instances: InstanceReport[];
  fullTestSuite: FullTestSuite;
  gitInfo: Commit | null;
  runTags: string[];
  /** The API then ignores the tags the full test suite reads from titles */
  disableTitleTags?: boolean;
  /** Replaces the group of every instance, as the upload does */
  group?: string | null;
}): AppliedActionsSummary {
  const summary: AppliedActionsSummary = {
    skipped: 0,
    quarantined: 0,
    tagged: 0,
  };
  if (actions.length === 0) {
    return summary;
  }

  const rules = new RulesEvalBase(actions, debug);

  for (const instance of instances) {
    const groupId = group ?? instance.groupId;
    for (const test of instance.results.tests) {
      const suiteTags = disableTitleTags
        ? []
        : (findFullTestSuiteTest(fullTestSuite, {
            groupId,
            spec: instance.spec,
            testId: test.testId,
          })?.test.tags ?? []);
      const matched = rules.getMatchedRules(
        getMatchable({
          groupId,
          spec: instance.spec,
          test,
          gitInfo,
          tags: [...suiteTags, ...runTags],
        })
      );
      if (matched.length === 0) {
        continue;
      }
      debug('Test %s matched actions: %j', test.testId, matched);

      const tags = applyTagActions(test, matched);
      if (tags.length > 0) {
        addFullTestSuiteTags(fullTestSuite, {
          groupId,
          spec: instance.spec,
          testId: test.testId,
          tags,
        });
        summary.tagged++;
      }

      // A skipped test is never quarantined, as with @currents/playwright
      const skip = findAction(matched, ACTION_TYPE.SKIP);
      const quarantine = findAction(matched, ACTION_TYPE.QUARANTINE);
      if (skip) {
        markAsSkipped(test, skip, ACTION_ANNOTATIONS.SKIP_POST);
        summary.skipped++;
      } else if (quarantine && test.state === 'failed') {
        markAsSkipped(test, quarantine, ACTION_ANNOTATIONS.QUARANTINE_POST);
        summary.quarantined++;
      }
    }
  }

  return summary;
}

export function logAppliedActions(summary: AppliedActionsSummary) {
  if (summary.skipped + summary.quarantined + summary.tagged === 0) {
    return;
  }
  info(
    '[currents] Actions: %d tests skipped, %d quarantined, %d tagged',
    summary.skipped,
    summary.quarantined,
    summary.tagged
  );
}

// The same test fields the Currents API matches actions on. The API takes the
// tags of a test from the full test suite, and adds the tags of the run.
function getMatchable({
  groupId,
  spec,
  test,
  gitInfo,
  tags,
}: {
  groupId: string;
  spec: string;
  test: InstanceReportTest;
  gitInfo: Commit | null;
  tags: string[];
}): RuleMatchable {
  return {
    title: test.title[test.title.length - 1],
    titlePath: [spec, ...test.title],
    file: spec,
    project: groupId,
    testId: test.testId,
    tag: Array.from(new Set([...(test.tags ?? []), ...tags])),
    gitInfo: gitInfo && {
      branch: gitInfo.branch,
      authorName: gitInfo.authorName,
      authorEmail: gitInfo.authorEmail,
      remoteOrigin: gitInfo.remoteOrigin,
      message: gitInfo.message,
    },
    errors: test.attempts
      .flatMap((attempt) => attempt.errors)
      .filter((error) => !!error.message)
      .map((error) => ({ message: error.message as string })),
  };
}

function findAction(actions: Action[], type: ACTION_TYPE) {
  return actions.find((action) => action.action.some((a) => a.op === type));
}

// Returns the tags added to the test, without the @ prefix like the other tags
function applyTagActions(test: InstanceReportTest, actions: Action[]) {
  const added: string[] = [];
  for (const action of actions) {
    for (const op of action.action) {
      if (op.op !== ACTION_TYPE.TAG) {
        continue;
      }
      const tags = normalizeTagMatcherValue(op.details?.tags ?? []);
      if (tags.length === 0) {
        continue;
      }
      addAnnotation(
        test,
        ACTION_ANNOTATIONS.TAG,
        getActionTrace({
          action,
          type: ACTION_TYPE.TAG,
          testId: test.testId,
          extraDetails: { tags },
        })
      );
      added.push(...normalizeTagMatcherValue(tags, { removeAtPrefix: true }));
    }
  }

  if (added.length > 0) {
    test.tags = Array.from(new Set([...(test.tags ?? []), ...added]));
  }
  return added;
}

function markAsSkipped(
  test: InstanceReportTest,
  action: Action,
  annotationType: ACTION_ANNOTATIONS
) {
  const status = test.state;
  addAnnotation(
    test,
    annotationType,
    getActionTrace({
      action,
      type:
        annotationType === ACTION_ANNOTATIONS.SKIP_POST
          ? ACTION_TYPE.SKIP
          : ACTION_TYPE.QUARANTINE,
      testId: test.testId,
      extraDetails: { status },
    })
  );
  // The API counts the instance stats from the test states
  test.state = 'pending';
}

function addAnnotation(
  test: InstanceReportTest,
  type: ACTION_ANNOTATIONS,
  trace: RuleTrace
) {
  test.annotations = [
    ...(test.annotations ?? []),
    { type, description: JSON.stringify(trace), source: 'test' },
  ];
}

function getActionTrace({
  action,
  type,
  testId,
  extraDetails,
}: {
  action: Action;
  type: ACTION_TYPE;
  testId: string;
  extraDetails: Record<string, unknown>;
}): RuleTrace {
  return {
    rule: {
      v: action.v,
      id: action._id,
      name: action.name.slice(0, MAX_ACTION_NAME_LENGTH),
      type,
      extraDetails,
      appliedAt: Date.now(),
    },
    testInfo: {
      testId,
      status: extraDetails.status,
    },
  };
}

function findFullTestSuiteTest(
  fullTestSuite: FullTestSuite,
  { groupId, spec, testId }: { groupId: string; spec: string; testId: string }
) {
  const project = fullTestSuite.find((p) => p.name === groupId);
  const test = project?.tests.find(
    (t) => t.spec === spec && t.testId === testId
  );
  return project && test ? { project, test } : null;
}

function addFullTestSuiteTags(
  fullTestSuite: FullTestSuite,
  {
    groupId,
    spec,
    testId,
    tags,
  }: { groupId: string; spec: string; testId: string; tags: string[] }
) {
  const found = findFullTestSuiteTest(fullTestSuite, { groupId, spec, testId });
  if (!found) {
    return;
  }
  // Not on the project: the API adds the tags of a project to all its tests
  found.test.tags = Array.from(new Set([...found.test.tags, ...tags]));
}
