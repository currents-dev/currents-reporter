import { describe, expect, it } from 'vitest';
import { toJsonLine } from '../json';

describe('toJsonLine', () => {
  it('prints a failed testEnd on one line without colour codes', () => {
    const line = toJsonLine({
      type: 'testEnd',
      testId: 'r1',
      status: 'failed',
      durationMs: 1200,
      retry: 0,
      error:
        'Error: \u001b[2mexpect(\u001b[22m\u001b[31mreceived\u001b[39m\u001b[2m).toBe(\u001b[22mexpected\u001b[2m)\u001b[22m\n\nExpected: \u001b[32m1\u001b[39m',
      errorDetail: {
        location: { file: 'tests/login.spec.ts', line: 12 },
        snippet:
          '\u001b[0m \u001b[90m 11 |\u001b[39m\n\u001b[31m\u001b[1m>\u001b[22m\u001b[39m\u001b[90m 12 |\u001b[39m   expect(\u001b[35m2\u001b[39m)\u001b[0m',
      },
      title: ['auth', 'logs in'],
      file: 'tests/login.spec.ts',
      project: 'chromium',
    });
    expect(line).not.toContain('\n');
    expect(JSON.parse(line)).toEqual({
      type: 'testEnd',
      testId: 'r1',
      status: 'failed',
      durationMs: 1200,
      retry: 0,
      error: 'Error: expect(received).toBe(expected)\n\nExpected: 1',
      errorDetail: {
        location: { file: 'tests/login.spec.ts', line: 12 },
        snippet: '  11 |\n> 12 |   expect(2)',
      },
      title: ['auth', 'logs in'],
      file: 'tests/login.spec.ts',
      project: 'chromium',
    });
  });

  it('removes colour codes from a failed step', () => {
    expect(
      JSON.parse(
        toJsonLine({
          type: 'stepEnd',
          testId: 'r1',
          stepId: 's1',
          durationMs: 30,
          error: '\u001b[31mTimeout 5000ms exceeded\u001b[39m',
        })
      )
    ).toEqual({
      type: 'stepEnd',
      testId: 'r1',
      stepId: 's1',
      durationMs: 30,
      error: 'Timeout 5000ms exceeded',
    });
  });

  it('leaves out fields that have no value', () => {
    expect(
      toJsonLine({
        type: 'testEnd',
        testId: 'r1',
        status: 'passed',
        durationMs: 50,
        retry: 0,
      })
    ).toBe(
      '{"type":"testEnd","testId":"r1","status":"passed","durationMs":50,"retry":0}'
    );
    expect(toJsonLine({ type: 'runEnd', status: 'passed' })).toBe(
      '{"type":"runEnd","status":"passed"}'
    );
  });
});
