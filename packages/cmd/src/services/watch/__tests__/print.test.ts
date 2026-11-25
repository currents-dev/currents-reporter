import { describe, expect, it, vi } from 'vitest';
import { createLinePrinter } from '../print';

vi.mock('@logger', () => {
  const plain = (s: string) => s;
  return { dim: plain, green: plain, red: plain, yellow: plain };
});

describe('createLinePrinter', () => {
  it('prints finished tests and a summary that counts the last result', () => {
    const lines: string[] = [];
    const print = createLinePrinter((line) => lines.push(line));
    print({ type: 'runBegin', totalTests: 2, startedAt: 0 });
    print({
      type: 'testBegin',
      testId: 'a',
      title: ['auth', 'logs in'],
      file: 'login.spec.ts',
      project: 'chromium',
      worker: 'm/0',
      retry: 0,
    });
    print({
      type: 'testEnd',
      testId: 'a',
      status: 'failed',
      durationMs: 1200,
      retry: 0,
      error: '\nExpected 1\nReceived 2',
    });
    print({
      type: 'testBegin',
      testId: 'a',
      title: ['auth', 'logs in'],
      file: 'login.spec.ts',
      project: 'chromium',
      worker: 'm/1',
      retry: 1,
    });
    print({
      type: 'testEnd',
      testId: 'a',
      status: 'flaky',
      durationMs: 900,
      retry: 1,
    });
    print({
      type: 'testBegin',
      testId: 'b',
      title: ['pays'],
      file: 'cart.spec.ts',
      worker: 'm/0',
      retry: 0,
    });
    print({
      type: 'testEnd',
      testId: 'b',
      status: 'passed',
      durationMs: 50,
      retry: 0,
    });
    print({ type: 'runEnd', status: 'passed' });
    expect(lines).toEqual([
      'Watching 2 tests',
      '▸ [chromium] login.spec.ts › auth › logs in',
      '✗ [chromium] login.spec.ts › auth › logs in 1.2s',
      '      Expected 1',
      '      Received 2',
      '▸ [chromium] login.spec.ts › auth › logs in (retry 1)',
      '~ [chromium] login.spec.ts › auth › logs in (retry 1) 0.9s',
      '▸ cart.spec.ts › pays',
      '✓ cart.spec.ts › pays 0.1s',
      '',
      'Run passed: 1 passed, 0 failed, 1 flaky, 0 skipped',
    ]);
  });

  it('prints steps as they begin, skips setup, and prints an error once', () => {
    const lines: string[] = [];
    const print = createLinePrinter((line) => lines.push(line), '/repo');
    print({
      type: 'testBegin',
      testId: 'a',
      title: ['checkout'],
      file: 'cart.spec.ts',
      worker: 'm/0',
      retry: 0,
    });
    print({
      type: 'stepBegin',
      testId: 'a',
      stepId: 'hook',
      title: 'Before Hooks',
      category: 'hook',
    });
    print({
      type: 'stepBegin',
      testId: 'a',
      stepId: 'fixture',
      title: 'page',
      category: 'fixture',
      parentStepId: 'hook',
    });
    print({ type: 'stepEnd', testId: 'a', stepId: 'hook', durationMs: 5 });
    print({
      type: 'stepBegin',
      testId: 'a',
      stepId: 'total',
      title: 'check the total',
      category: 'test.step',
    });
    print({
      type: 'stepBegin',
      testId: 'a',
      stepId: 'expect',
      title: 'toBe',
      category: 'expect',
      parentStepId: 'total',
    });
    const error = 'Error: wrong total\nExpected: 2';
    const errorDetail = {
      location: { file: '/repo/tests/cart.spec.ts', line: 22 },
      snippet: '> 22 |   expect(total).toBe(2);',
    };
    print({
      type: 'stepEnd',
      testId: 'a',
      stepId: 'expect',
      durationMs: 1,
      error,
      errorDetail,
    });
    print({
      type: 'stepEnd',
      testId: 'a',
      stepId: 'total',
      durationMs: 1000,
      error,
      errorDetail,
    });
    print({
      type: 'testEnd',
      testId: 'a',
      status: 'failed',
      durationMs: 1200,
      retry: 0,
      error,
      errorDetail,
    });
    expect(lines).toEqual([
      '▸ cart.spec.ts › checkout',
      '  checkout › check the total',
      '  checkout ›   toBe',
      '  checkout ›   ✗ toBe 0.0s',
      '      Error: wrong total',
      '      Expected: 2',
      '      at tests/cart.spec.ts:22',
      '      > 22 |   expect(total).toBe(2);',
      '  checkout › ✗ check the total 1.0s',
      '✗ cart.spec.ts › checkout 1.2s',
    ]);
  });
});
