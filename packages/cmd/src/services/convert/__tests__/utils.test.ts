import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getSuiteName,
  getTestCase,
  secondsToMilliseconds,
  timeToMilliseconds,
} from '../utils';
import {
  instanceReportTestNoTime,
  instanceReportTestNoTimestamp,
  instanceReportTestWithFailure,
  instanceReportTestWithoutFailure,
  mockDate,
  suiteNameNoTime,
  suiteNameNoTimestamp,
  suiteNameWithFailure,
  suiteNameWithoutFailure,
  suiteNoTime,
  suiteNoTimestamp,
  suiteWithFailure,
  suiteWithoutFailure,
  testCaseNoTime,
  testCaseNoTimestamp,
  testCaseWithFailure,
  testCaseWithoutFailure,
  time,
} from './fixtures';

describe('getSuiteName', () => {
  it.each([
    [
      'returns file name when no duplicates',
      { file: 'testFile.js', id: '1' },
      [{ file: 'testFile.js', id: '2' }],
      undefined,
      'testFile.js',
    ],
    [
      'appends id to file name when file is duplicate',
      { file: 'testFile.js', id: '1' },
      [
        { file: 'testFile.js', id: '1' },
        { file: 'testFile.js', id: '2' },
      ],
      undefined,
      'testFile.js - 1',
    ],
    [
      'appends index to file name when file is duplicate, id is duplicate, and index is provided',
      { file: 'testFile.js', id: '1' },
      [
        { file: 'testFile.js', id: '1' },
        { file: 'testFile.js', id: '1' },
      ],
      1,
      'testFile.js - 1',
    ],

    [
      'returns the file name when file is duplicate, id is duplicate, and index is 0',
      { file: 'testFile.js', id: '1' },
      [
        { file: 'testFile.js', id: '1' },
        { file: 'testFile.js', id: '1' },
      ],
      0,
      'testFile.js',
    ],

    [
      'returns name when no duplicates',
      { name: 'testSuite', id: '1' },
      [{ name: 'testSuite', id: '2' }],
      undefined,
      'testSuite',
    ],
    [
      'appends id to name when name is duplicate',
      { name: 'testSuite', id: '1' },
      [
        { name: 'testSuite', id: '1' },
        { name: 'testSuite', id: '2' },
      ],
      undefined,
      'testSuite - 1',
    ],
    [
      'appends index to name when name is duplicate, id is duplicate, and index is provided',
      { name: 'testSuite', id: '1' },
      [
        { name: 'testSuite', id: '1' },
        { name: 'testSuite', id: '1' },
      ],
      1,
      'testSuite - 1',
    ],

    [
      'returns the name when name is duplicate, id is duplicate, and index is 0',
      { name: 'testSuite', id: '1' },
      [
        { name: 'testSuite', id: '1' },
        { name: 'testSuite', id: '1' },
      ],
      0,
      'testSuite',
    ],

    [
      'returns id when no file or name is present',
      { id: '1' },
      [{ id: '2' }],
      undefined,
      '1',
    ],
    [
      'appends index to id when id is duplicate and index is provided',
      { id: '1' },
      [{ id: '1' }, { id: '1' }],
      2,
      '1 - 2',
    ],
    [
      'returns the id when id is duplicate and index is 0',
      { id: '1' },
      [{ id: '1' }, { id: '1' }],
      0,
      '1',
    ],

    [
      'returns "unknown - index" when no file, name, or id is present, and index is provided',
      {},
      [],
      2,
      'unknown - 2',
    ],
    [
      'returns "unknown" when no file, name, or id is present and no index is provided',
      {},
      [],
      undefined,
      'unknown',
    ],
  ])('%s', (_, suite, allSuites, index, expected) => {
    expect(getSuiteName(suite, allSuites, index)).toBe(expected);
  });
});

describe('getTestCase', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(mockDate);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it.each([
    [
      'should return the correct structure when the test case has a failure',
      testCaseWithFailure,
      suiteWithFailure,
      suiteNameWithFailure,
      instanceReportTestWithFailure,
    ],
    [
      'should return the correct structure when the test case has no failure',
      testCaseWithoutFailure,
      suiteWithoutFailure,
      suiteNameWithoutFailure,
      instanceReportTestWithoutFailure,
    ],
    [
      'should use the current date when the test case timestamp is not provided',
      testCaseNoTimestamp,
      suiteNoTimestamp,
      suiteNameNoTimestamp,
      instanceReportTestNoTimestamp,
    ],
    [
      'should set the duration to 0 when test case time is not provided',
      testCaseNoTime,
      suiteNoTime,
      suiteNameNoTime,
      instanceReportTestNoTime,
    ],
  ])('%s', (_, testCase, suite, suiteName, expected) => {
    expect(getTestCase(testCase, suite, time, suiteName)).toEqual(expected);
  });
});

describe('secondsToMilliseconds', () => {
  it.each([
    [1, 1000],
    [0.5, 500],
    [0, 0],
    [0.12345, 123],
    [1000, 1000000],
  ])('should convert %s seconds to %s milliseconds', (seconds, expectedMs) => {
    const result = secondsToMilliseconds(seconds);
    expect(result).toBe(expectedMs);
  });
});

describe('timeToMilliseconds', () => {
  it.each([
    ['1.5', 1500],
    ['0.25', 250],
    ['2', 2000],
    ['0', 0],
    ['0.12345', 123],
    ['invalid', 0],
  ])(
    'should converts time string "%s" to %s milliseconds',
    (time, expectedMs) => {
      const result = timeToMilliseconds(time);
      expect(result).toBe(expectedMs);
    }
  );
});
