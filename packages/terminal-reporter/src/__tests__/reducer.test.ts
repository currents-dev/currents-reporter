import { describe, expect, it } from 'vitest';
import { initialState, reduce } from '../reducer';
import type { TerminalRunEvent } from '../types';

const run = (events: TerminalRunEvent[]) =>
  events.reduce(reduce, initialState());

const begin = (testId: string, worker = '0', retry = 0): TerminalRunEvent => ({
  type: 'testBegin',
  testId,
  title: ['suite', testId],
  file: 'a.spec.ts',
  worker,
  retry,
});

const end = (
  testId: string,
  status: 'passed' | 'failed' | 'flaky' = 'passed',
  retry = 0
): TerminalRunEvent => ({
  type: 'testEnd',
  testId,
  status,
  durationMs: 10,
  retry,
});

describe('reduce', () => {
  it('tracks workers, counts and finished order', () => {
    const state = run([
      { type: 'runBegin', totalTests: 3, startedAt: 1000, runUrl: 'u' },
      begin('a', '0'),
      begin('b', '1'),
      end('b', 'failed'),
      end('a'),
    ]);
    expect(state.status).toBe('running');
    expect(state.totalTests).toBe(3);
    expect(state.workers).toEqual({ '0': null, '1': null });
    expect(state.finished).toEqual(['b', 'a']);
    expect(state.counts).toMatchObject({ passed: 1, failed: 1 });
  });

  it('keeps a stack of open steps', () => {
    const step = (stepId: string): TerminalRunEvent => ({
      type: 'stepBegin',
      testId: 'a',
      stepId,
      title: `step ${stepId}`,
      location: { file: 'a.spec.ts', line: 3 },
    });
    let state = run([begin('a'), step('1'), step('2')]);
    expect(state.tests.a.steps.map((s) => s.stepId)).toEqual(['1', '2']);
    expect(state.tests.a.steps[1].location).toEqual({
      file: 'a.spec.ts',
      line: 3,
    });
    state = reduce(state, {
      type: 'stepEnd',
      testId: 'a',
      stepId: '2',
      durationMs: 1,
    });
    expect(state.tests.a.steps.map((s) => s.stepId)).toEqual(['1']);
    state = reduce(state, end('a'));
    expect(state.tests.a.steps).toEqual([]);
  });

  it('counts a retried test once, with its last result', () => {
    const state = run([
      begin('a', '0'),
      end('a', 'failed'),
      begin('a', '2', 1),
      end('a', 'flaky', 1),
    ]);
    expect(state.counts).toMatchObject({ failed: 0, flaky: 1 });
    expect(state.finished).toEqual(['a']);
    expect(state.tests.a.retry).toBe(1);
    expect(state.workers).toEqual({ '0': null, '2': null });
  });

  it('drops the earlier result while a retry runs', () => {
    const state = run([begin('a'), end('a', 'failed'), begin('a', '0', 1)]);
    expect(state.counts.failed).toBe(0);
    expect(state.finished).toEqual([]);
    expect(state.workers['0']).toBe('a');
  });

  it('ignores events for unknown tests', () => {
    const before = run([begin('a')]);
    const events: TerminalRunEvent[] = [
      { type: 'stepBegin', testId: 'x', stepId: '1', title: 't' },
      { type: 'stepEnd', testId: 'x', stepId: '1', durationMs: 1 },
      end('x'),
    ];
    const after = events.reduce(reduce, before);
    expect(after).toEqual(before);
  });

  it('frees all workers on runEnd', () => {
    const state = run([begin('a'), { type: 'runEnd', status: 'cancelled' }]);
    expect(state.status).toBe('cancelled');
    expect(state.workers).toEqual({ '0': null });
  });
});
