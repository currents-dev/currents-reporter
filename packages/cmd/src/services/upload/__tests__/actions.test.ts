import { Action } from '@currents/rules';
import { describe, expect, it } from 'vitest';
import { InstanceReport, InstanceReportTest } from '../../../types';
import { applyProjectActions } from '../actions';

const action = (overrides: Partial<Action>): Action =>
  ({
    _id: 'id',
    v: 0,
    name: 'action',
    action: [{ op: 'quarantine' }],
    matcher: { op: 'AND', cond: [{ type: 'title', op: 'eq', value: 'test' }] },
    createdAt: new Date(),
    createdBy: 'user',
    ...overrides,
  }) as Action;

const test = (overrides: Partial<InstanceReportTest>): InstanceReportTest => ({
  _t: 0,
  testId: 'test-id',
  title: ['suite', 'test'],
  state: 'failed',
  retries: 0,
  timeout: 0,
  location: { file: 'spec.xml', line: 1, column: 1 },
  attempts: [
    {
      _s: 'failed',
      attempt: 0,
      startTime: '2026-10-15T00:00:00.000Z',
      steps: [],
      duration: 1,
      status: 'failed',
      errors: [{ message: 'Element not found' }],
    },
  ],
  ...overrides,
});

const instance = (tests: InstanceReportTest[]): InstanceReport => ({
  groupId: 'android',
  spec: 'spec.xml',
  startTime: '2026-10-15T00:00:00.000Z',
  results: {
    stats: {
      suites: 1,
      tests: tests.length,
      passes: 0,
      pending: 0,
      skipped: 0,
      failures: tests.length,
      flaky: 0,
      wallClockStartedAt: '2026-10-15T00:00:00.000Z',
      wallClockEndedAt: '2026-10-15T00:00:00.000Z',
      wallClockDuration: 0,
    },
    tests,
  },
});

const apply = (actions: Action[], tests: InstanceReportTest[], extra = {}) => {
  const instances = [instance(tests)];
  const summary = applyProjectActions({
    actions,
    instances,
    fullTestSuite: [],
    gitInfo: null,
    runTags: [],
    ...extra,
  });
  return { summary, tests: instances[0].results.tests };
};

describe('applyProjectActions', () => {
  it('matches on the error message and the run tags', () => {
    const { tests } = apply(
      [
        action({
          matcher: {
            op: 'AND',
            cond: [
              { type: 'error_message', op: 'inc', value: 'not found' },
              { type: 'tag', op: 'inc', value: ['nightly'] },
            ],
          },
        }),
      ],
      [test({})],
      { runTags: ['nightly'] }
    );
    expect(tests[0].state).toBe('pending');
  });

  describe('tags', () => {
    const smokeAction = action({
      matcher: {
        op: 'AND',
        cond: [{ type: 'tag', op: 'inc', value: ['@smoke'] }],
      },
    });
    const fullTestSuite = () => [
      {
        name: 'android',
        tags: ['smoke'],
        tests: [
          {
            spec: 'spec.xml',
            testId: 'test-id',
            title: ['suite', 'test @smoke'],
            tags: ['smoke'],
          },
        ],
      },
    ];

    it('matches on the tags of the test in the full test suite', () => {
      const { tests } = apply([smokeAction], [test({})], {
        fullTestSuite: fullTestSuite(),
      });
      expect(tests[0].state).toBe('pending');
    });

    it('ignores those tags with disableTitleTags, as the API does', () => {
      const { tests } = apply([smokeAction], [test({})], {
        fullTestSuite: fullTestSuite(),
        disableTitleTags: true,
      });
      expect(tests[0].state).toBe('failed');
    });
  });

  it('matches on the group the upload uses', () => {
    const { tests } = apply(
      [
        action({
          matcher: {
            op: 'AND',
            cond: [{ type: 'project', op: 'eq', value: 'ios' }],
          },
        }),
      ],
      [test({})],
      { group: 'ios' }
    );
    expect(tests[0].state).toBe('pending');
  });

  it('skips instead of quarantining when both match', () => {
    const { summary, tests } = apply(
      [
        action({ _id: 'quarantine' }),
        action({ _id: 'skip', action: [{ op: 'skip' }] }),
      ],
      [test({})]
    );
    expect(summary).toEqual({ skipped: 1, quarantined: 0, tagged: 0 });
    expect(tests[0].annotations).toHaveLength(1);
    expect(tests[0].annotations?.[0]).toMatchObject({
      type: '_currents:rule:skip-post',
    });
  });

  it('leaves the results alone when no action matches', () => {
    const original = test({});
    const { summary, tests } = apply(
      [
        action({
          matcher: {
            op: 'AND',
            cond: [{ type: 'title', op: 'eq', value: 'another' }],
          },
        }),
      ],
      [test({})]
    );
    expect(summary).toEqual({ skipped: 0, quarantined: 0, tagged: 0 });
    expect(tests[0]).toEqual(original);
  });
});
