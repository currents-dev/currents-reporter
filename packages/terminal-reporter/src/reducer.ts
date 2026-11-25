import type { TerminalRunEvent, TerminalRunState, TestState } from './types';

export function initialState(): TerminalRunState {
  return {
    totalTests: 0,
    status: 'pending',
    tests: {},
    workers: {},
    finished: [],
    counts: { passed: 0, failed: 0, flaky: 0, skipped: 0, timedOut: 0 },
  };
}

/**
 * Pure reducer for the terminal view. Unknown test ids in step and end events
 * are ignored, so a stream joined mid-run (remote mode) does not throw.
 */
export function reduce(
  state: TerminalRunState,
  event: TerminalRunEvent
): TerminalRunState {
  switch (event.type) {
    case 'runBegin':
      return {
        ...state,
        status: 'running',
        totalTests: event.totalTests,
        startedAt: event.startedAt,
        runUrl: event.runUrl,
      };

    case 'testBegin': {
      const previous = state.tests[event.testId];
      const workers = { ...state.workers };
      if (previous && workers[previous.worker] === event.testId) {
        workers[previous.worker] = null;
      }
      workers[event.worker] = event.testId;
      // A retry replaces the earlier attempt's result until it ends.
      const counts = { ...state.counts };
      if (previous && previous.status !== 'running') {
        counts[previous.status] -= 1;
      }
      return {
        ...state,
        status: state.status === 'pending' ? 'running' : state.status,
        workers,
        counts,
        finished: state.finished.filter((id) => id !== event.testId),
        tests: {
          ...state.tests,
          [event.testId]: {
            testId: event.testId,
            title: event.title,
            file: event.file,
            project: event.project,
            worker: event.worker,
            retry: event.retry,
            steps: [],
            status: 'running',
          },
        },
      };
    }

    case 'stepBegin': {
      const test = state.tests[event.testId];
      if (!test) return state;
      const { type, testId, ...step } = event;
      return withTest(state, { ...test, steps: [...test.steps, step] });
    }

    case 'stepEnd': {
      const test = state.tests[event.testId];
      if (!test) return state;
      return withTest(state, {
        ...test,
        steps: test.steps.filter((s) => s.stepId !== event.stepId),
      });
    }

    case 'testEnd': {
      const test = state.tests[event.testId];
      if (!test) return state;
      const counts = { ...state.counts };
      // An end without a new begin (a duplicate) replaces the earlier result.
      if (test.status !== 'running') counts[test.status] -= 1;
      counts[event.status] += 1;
      const workers = { ...state.workers };
      if (workers[test.worker] === test.testId) workers[test.worker] = null;
      return {
        ...withTest(state, {
          ...test,
          steps: [],
          status: event.status,
          retry: event.retry,
          durationMs: event.durationMs,
          error: event.error,
          testUrl: event.testUrl,
        }),
        workers,
        counts,
        finished: [
          ...state.finished.filter((id) => id !== test.testId),
          test.testId,
        ],
      };
    }

    case 'runEnd': {
      const workers = Object.fromEntries(
        Object.keys(state.workers).map((w) => [w, null])
      );
      return { ...state, status: event.status, workers };
    }
  }
}

function withTest(state: TerminalRunState, test: TestState): TerminalRunState {
  return { ...state, tests: { ...state.tests, [test.testId]: test } };
}

export function finishedCount(state: TerminalRunState) {
  return Object.values(state.counts).reduce((a, b) => a + b, 0);
}
