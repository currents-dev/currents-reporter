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
      '✗ [chromium] login.spec.ts › auth › logs in 1.2s',
      '    Expected 1',
      '~ [chromium] login.spec.ts › auth › logs in (retry 1) 0.9s',
      '✓ cart.spec.ts › pays 0.1s',
      '',
      'Run passed: 1 passed, 0 failed, 1 flaky, 0 skipped',
    ]);
  });
});
