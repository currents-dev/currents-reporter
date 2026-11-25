import { describe, expect, it } from 'vitest';
import {
  RecordEvents,
  type TestRecord,
  type TestRecordAttempt,
} from '../records';

const attempt = (over: Partial<TestRecordAttempt> = {}): TestRecordAttempt => ({
  attempt: 0,
  parallelIndex: 1,
  status: 'passed',
  duration: 1200,
  done: false,
  lastStep: null,
  ...over,
});

const record = (over: Partial<TestRecord> = {}): TestRecord => ({
  recordId: 'r1',
  machineId: 'm1',
  project: 'chromium',
  spec: 'login.spec.ts',
  title: ['auth', 'logs in'],
  done: false,
  flaky: false,
  attempts: [attempt()],
  ...over,
});

const step = (id: string, done = false) => ({
  id,
  done,
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
          done: true,
          attempts: [attempt({ done: true, lastStep: step('s2', true) })],
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
      },
    ]);
    expect(
      events.next(record({ done: true, attempts: [attempt({ done: true })] }))
    ).toEqual([]);
  });

  it('reports each attempt and marks the last one flaky', () => {
    const events = new RecordEvents();
    const failed = attempt({
      done: true,
      status: 'failed',
      error: { message: 'Expected 1\nReceived 2' },
    });
    const retry = attempt({ attempt: 1, parallelIndex: 2, done: true });
    const out = events.next(
      record({ done: true, flaky: true, attempts: [retry, failed] })
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
    const failed = attempt({ done: true, status: 'failed' });
    const passed = attempt({ attempt: 1, done: true });
    events.next(record({ attempts: [failed, passed] }));
    expect(
      events.next(
        record({ done: true, flaky: true, attempts: [failed, passed] })
      )
    ).toEqual([
      {
        type: 'testEnd',
        testId: 'r1',
        status: 'flaky',
        durationMs: 1200,
        retry: 1,
        error: undefined,
      },
    ]);
  });

  it('reports an interrupted attempt as failed', () => {
    const out = new RecordEvents().next(
      record({ attempts: [attempt({ done: true, status: 'interrupted' })] })
    );
    expect(out[1]).toMatchObject({ status: 'failed', error: 'Interrupted' });
  });
});
