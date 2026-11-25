import { describe, expect, it } from 'vitest';
import {
  RecordEvents,
  type AttemptStep,
  type TestRecord,
  type TestRecordAttempt,
} from '../records';

const attempt = (over: Partial<TestRecordAttempt> = {}): TestRecordAttempt => ({
  attempt: 0,
  parallelIndex: 1,
  status: 'passed',
  duration: 1200,
  _d: false,
  lastStep: null,
  ...over,
});

const record = (over: Partial<TestRecord> = {}): TestRecord => ({
  recordId: 'r1',
  machineId: 'm1',
  groupId: 'chromium',
  spec: 'login.spec.ts',
  title: ['auth', 'logs in'],
  _d: false,
  _f: false,
  attempts: [attempt()],
  ...over,
});

const step = (id: string, done = false) => ({
  id,
  _d: done,
  title: `step ${id}`,
  category: 'pw:api',
  duration: 30,
});

describe('RecordEvents', () => {
  it('begins a test once and follows its current step', () => {
    const events = new RecordEvents();
    expect(
      events.next(record({ attempts: [attempt({ lastStep: step('s1') })] }))
    ).toEqual([
      {
        type: 'testBegin',
        testId: 'r1',
        title: ['auth', 'logs in'],
        file: 'login.spec.ts',
        project: 'chromium',
        worker: 'm1/1',
        retry: 0,
      },
      {
        type: 'stepBegin',
        testId: 'r1',
        stepId: 's1',
        title: 'step s1',
        category: 'pw:api',
      },
    ]);
    expect(
      events.next(record({ attempts: [attempt({ lastStep: step('s1') })] }))
    ).toEqual([]);
    expect(
      events.next(record({ attempts: [attempt({ lastStep: step('s2') })] }))
    ).toEqual([
      { type: 'stepEnd', testId: 'r1', stepId: 's1', durationMs: 0 },
      {
        type: 'stepBegin',
        testId: 'r1',
        stepId: 's2',
        title: 'step s2',
        category: 'pw:api',
      },
    ]);
    expect(
      events.next(
        record({
          _d: true,
          attempts: [attempt({ _d: true, lastStep: step('s2', true) })],
        })
      )
    ).toEqual([
      { type: 'stepEnd', testId: 'r1', stepId: 's2', durationMs: 30 },
      {
        type: 'testEnd',
        testId: 'r1',
        status: 'passed',
        durationMs: 1200,
        retry: 0,
        error: undefined,
        title: ['auth', 'logs in'],
        file: 'login.spec.ts',
        project: 'chromium',
      },
    ]);
    expect(
      events.next(record({ _d: true, attempts: [attempt({ _d: true })] }))
    ).toEqual([]);
  });

  it('reports each attempt and marks the last one flaky', () => {
    const events = new RecordEvents();
    const failed = attempt({
      _d: true,
      status: 'failed',
      error: { message: 'Expected 1\nReceived 2' },
    });
    const retry = attempt({ attempt: 1, parallelIndex: 2, _d: true });
    const out = events.next(
      record({ _d: true, _f: true, attempts: [retry, failed] })
    );
    expect(
      out.map((e) => [e.type, 'status' in e ? e.status : undefined])
    ).toEqual([
      ['testBegin', undefined],
      ['testEnd', 'failed'],
      ['testBegin', undefined],
      ['testEnd', 'flaky'],
    ]);
    expect(out[2]).toMatchObject({ worker: 'm1/2', retry: 1 });
  });

  it('corrects the last result when the record is marked flaky later', () => {
    const events = new RecordEvents();
    const failed = attempt({ _d: true, status: 'failed' });
    const passed = attempt({ attempt: 1, _d: true });
    events.next(record({ attempts: [failed, passed] }));
    expect(
      events.next(record({ _d: true, _f: true, attempts: [failed, passed] }))
    ).toEqual([
      {
        type: 'testEnd',
        testId: 'r1',
        status: 'flaky',
        durationMs: 1200,
        retry: 1,
        error: undefined,
        title: ['auth', 'logs in'],
        file: 'login.spec.ts',
        project: 'chromium',
      },
    ]);
  });

  it('reports an interrupted attempt as failed', () => {
    const out = new RecordEvents().next(
      record({ attempts: [attempt({ _d: true, status: 'interrupted' })] })
    );
    expect(out[1]).toMatchObject({ status: 'failed', error: 'Interrupted' });
  });

  it('reports each step from the attempt steps, nested steps inside their parent', () => {
    const events = new RecordEvents();
    const s = (
      id: string,
      duration: number,
      steps: AttemptStep[] = [],
      error?: AttemptStep['error']
    ): AttemptStep => ({
      id,
      title: `step ${id}`,
      category: 'test.step',
      duration,
      steps,
      error,
    });
    const running = record({ attempts: [attempt({ lastStep: step('x') })] });
    expect(events.attemptsNeedingSteps(running)).toEqual([0]);
    expect(
      events
        .next(running, new Map([[0, [s('p', -1, [s('c1', 10)])]]]))
        .map((e) => [e.type, 'stepId' in e ? e.stepId : undefined])
    ).toEqual([
      ['testBegin', undefined],
      ['stepBegin', 'p'],
      ['stepBegin', 'c1'],
      ['stepEnd', 'c1'],
    ]);

    const error = {
      message: 'Expected 2',
      snippet: '> 4 | expect',
      location: { file: 'a.spec.ts', line: 4 },
    };
    const done = record({
      attempts: [attempt({ _d: true, status: 'failed', error })],
    });
    expect(events.attemptsNeedingSteps(done)).toEqual([0]);
    const out = events.next(
      done,
      new Map([[0, [s('p', 30, [s('c1', 10), s('c2', 5, [], error)], error)]]])
    );
    expect(
      out.map((e) => [e.type, 'stepId' in e ? e.stepId : undefined])
    ).toEqual([
      ['stepBegin', 'c2'],
      ['stepEnd', 'c2'],
      ['stepEnd', 'p'],
      ['testEnd', undefined],
    ]);
    expect(out[1]).toMatchObject({
      error: 'Expected 2',
      errorDetail: { location: { file: 'a.spec.ts', line: 4 } },
    });
    expect(out[0]).toMatchObject({ parentStepId: 'p' });
    expect(out[3]).toMatchObject({ errorDetail: { snippet: '> 4 | expect' } });
    expect(events.attemptsNeedingSteps(done)).toEqual([]);
  });

  it('reads no steps for a passed attempt first seen finished', () => {
    const events = new RecordEvents();
    expect(
      events.attemptsNeedingSteps(record({ attempts: [attempt({ _d: true })] }))
    ).toEqual([]);
  });
});
