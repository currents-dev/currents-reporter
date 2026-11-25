import { describe, expect, it } from 'vitest';
import type { AttemptStep } from '../../watch/records';
import {
  computeRunFacts,
  type WrappedAttempt,
  type WrappedRecord,
} from '../facts';

const T0 = Date.parse('2026-11-25T00:00:00.000Z');
const at = (s: number) => new Date(T0 + s * 1000).toISOString();

const attempt = (
  parallelIndex: number,
  startS: number,
  durationS: number,
  status: WrappedAttempt['status'] = 'passed',
  n = 0
): WrappedAttempt => ({
  attempt: n,
  parallelIndex,
  startTime: at(startS),
  status,
  duration: durationS * 1000,
});

const record = (
  name: string,
  attempts: WrappedAttempt[],
  { _s = 'passed', _f = false, machineId = 'm1' }: Partial<WrappedRecord> = {}
): WrappedRecord => ({
  recordId: name,
  machineId,
  title: ['suite', name],
  _s,
  _f,
  attempts,
});

const step = (
  title: string,
  durationS: number,
  steps: AttemptStep[] = [],
  extra: Partial<AttemptStep> = {}
): AttemptStep => ({
  id: `${title}-${durationS}`,
  title,
  duration: durationS * 1000,
  category: 'test.step',
  steps,
  ...extra,
});

describe('computeRunFacts', () => {
  const records = [
    record('a', [attempt(0, 1, 10)]),
    record('b', [attempt(1, 1, 30)]),
    record('c', [attempt(0, 12, 5, 'failed'), attempt(0, 17, 5, 'passed', 1)], {
      _f: true,
    }),
    record('d', [attempt(1, 32, 4, 'timedOut')], { _s: 'failed' }),
    record('e', [attempt(-1, 0, 0, 'skipped')], { _s: 'pending' }),
  ];

  it('counts tests, with flaky tests apart from passed ones', () => {
    const facts = computeRunFacts({ records, createdAt: T0 });
    expect(facts.tests).toEqual({
      total: 5,
      passed: 2,
      failed: 1,
      flaky: 1,
      skipped: 1,
    });
  });

  it('compares the time of all tests with the run time, leaving out skipped tests', () => {
    const facts = computeRunFacts({ records, createdAt: T0, wallMs: 40_000 });
    expect(facts.parallel).toEqual({
      workers: 2,
      testTimeMs: 54_000,
      wallMs: 40_000,
      savedMs: 14_000,
    });
    expect(facts.busiestWorker).toEqual({
      name: 'Worker 1',
      tests: 2,
      timeMs: 34_000,
      share: 34 / 54,
    });
  });

  it('counts a retry on the same worker as one test', () => {
    const facts = computeRunFacts({ records, createdAt: T0, wallMs: 20_000 });
    // Worker 0 ran `a` and both attempts of `c`.
    expect(facts.busiestWorker).toMatchObject({ name: 'Worker 1', tests: 2 });
    const worker0 = computeRunFacts({
      records: [records[0], records[2], record('x', [attempt(1, 0, 1)])],
      createdAt: T0,
      wallMs: 5_000,
    }).busiestWorker;
    expect(worker0).toMatchObject({
      name: 'Worker 0',
      tests: 2,
      timeMs: 20_000,
    });
  });

  it('takes the run time from the attempts when the run has none', () => {
    const facts = computeRunFacts({ records, createdAt: T0 });
    // From the run's creation to the end of `d` at 36 s.
    expect(facts.parallel?.wallMs).toBe(36_000);
  });

  it('names the machine of a worker when several machines ran tests', () => {
    const facts = computeRunFacts({
      records: [
        record('a', [attempt(0, 0, 10)], { machineId: 'm1' }),
        record('b', [attempt(0, 0, 20)], { machineId: 'm2' }),
      ],
      createdAt: T0,
      wallMs: 20_000,
    });
    expect(facts.busiestWorker?.name).toBe('Worker 0 on machine m2');
  });

  it('leaves out the time saved for one worker or no saving', () => {
    const one = computeRunFacts({
      records: [
        record('a', [attempt(0, 0, 10)]),
        record('b', [attempt(0, 10, 10)]),
      ],
      createdAt: T0,
    });
    expect(one.parallel).toBeUndefined();
    expect(one.busiestWorker).toBeUndefined();
    const slow = computeRunFacts({ records, createdAt: T0, wallMs: 60_000 });
    expect(slow.parallel).toBeUndefined();
  });

  it('finds the longest test, the flakiest test and the first failure', () => {
    const facts = computeRunFacts({ records, createdAt: T0 });
    expect(facts.longestTest).toEqual({ title: 'b', durationMs: 30_000 });
    expect(facts.flakiestTest).toEqual({
      title: 'c',
      failedAttempts: 1,
      failedMs: 5_000,
    });
    // `c` failed at 17 s, before `d` at 36 s.
    expect(facts.firstFailure).toEqual({ title: 'c', afterMs: 17_000 });
  });

  it('measures the first failure from the first attempt when it started before the run', () => {
    const facts = computeRunFacts({
      records: [record('a', [attempt(0, -2, 3, 'failed')], { _s: 'failed' })],
      createdAt: T0,
    });
    expect(facts.firstFailure?.afterMs).toBe(3_000);
  });

  it('breaks a tie between flaky tests by the time of their failed attempts', () => {
    const facts = computeRunFacts({
      records: [
        record(
          'short',
          [attempt(0, 0, 2, 'failed'), attempt(0, 2, 2, 'passed', 1)],
          { _f: true }
        ),
        record(
          'long',
          [attempt(1, 0, 9, 'failed'), attempt(1, 9, 2, 'passed', 1)],
          { _f: true }
        ),
      ],
      createdAt: T0,
    });
    expect(facts.flakiestTest?.title).toBe('long');
  });

  it('leaves out the failure and flaky facts when there are none', () => {
    const facts = computeRunFacts({
      records: [record('a', [attempt(0, 0, 1)])],
      createdAt: T0,
    });
    expect(facts.firstFailure).toBeUndefined();
    expect(facts.flakiestTest).toBeUndefined();
    expect(facts.steps).toBeUndefined();
  });

  it('counts every step and finds the slowest one outside setup', () => {
    const scenario = (s: number) =>
      step('run the scenario', s, [step('click', 1)], {
        location: { file: 'a.spec.ts', line: 3 },
      });
    const facts = computeRunFacts({
      records,
      createdAt: T0,
      attemptSteps: [
        [
          step('Before Hooks', 20, [step('fixture: page', 19)], {
            category: 'hook',
          }),
          scenario(8),
        ],
        [scenario(6)],
        [],
      ],
    });
    expect(facts.steps).toEqual({
      total: 6,
      slowest: { title: 'run the scenario', durationMs: 8_000, runs: 2 },
    });
  });

  it('counts steps with the same title together, at any line', () => {
    const facts = computeRunFacts({
      records,
      createdAt: T0,
      attemptSteps: [
        [step('open', 3, [], { location: { file: 'a.ts', line: 1 } })],
        [step('open', 2, [], { location: { file: 'b.ts', line: 1 } })],
      ],
    });
    expect(facts.steps?.slowest?.runs).toBe(2);
  });
});
