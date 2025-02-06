import { InstanceReportTest } from '../../../../types';
import { TestCase, TestSuite } from '../../types';

export const mockDate = new Date('2024-12-28T12:00:00Z');
export const time = 5000;
export const location = { line: 1, column: 1 };

export const testCaseWithFailure: TestCase = {
  name: 'Test with failure',
  classname: 'Classname',
  time: '5.000',
  failure: [{ message: 'Error message', type: 'AssertionError' }],
};

export const suiteNameWithFailure = 'Test Suite';
export const suiteWithFailure: TestSuite = {
  id: '1',
  name: suiteNameWithFailure,
  timestamp: '2024-12-28T12:00:00Z',
  file: 'testfile.ts',
};

export const instanceReportTestWithFailure: InstanceReportTest = {
  _t: mockDate.getTime(),
  testId: 'dc613ff86a9914bc',
  title: [suiteNameWithFailure, 'Test with failure'],
  state: 'failed',
  isFlaky: false,
  expectedStatus: 'passed',
  timeout: 0,
  location: { ...location, file: 'testfile.ts' },
  retries: 1,
  attempts: [
    {
      _s: 'failed',
      attempt: 0,
      startTime: new Date('2024-12-28T12:00:05Z').toISOString(),
      steps: [],
      duration: time,
      status: 'failed',
      stdout: [],
      stderr: [],
      errors: [
        {
          message: 'Error message',
          stack: undefined,
          value: 'AssertionError',
        },
      ],
      error: {
        message: 'Error message',
        stack: undefined,
        value: 'AssertionError',
      },
    },
  ],
};

export const testCaseWithoutFailure: TestCase = {
  name: 'Test without failure',
  classname: 'Classname',
  time: '5.000',
  failure: [],
};

export const suiteNameWithoutFailure = 'Another Test Suite';
export const suiteWithoutFailure: TestSuite = {
  id: '2',
  name: suiteNameWithoutFailure,
  timestamp: '2024-12-28T12:00:00Z',
  file: 'anothertestfile.ts',
};

export const instanceReportTestWithoutFailure: InstanceReportTest = {
  _t: mockDate.getTime(),
  testId: '761887be9aa0481c',
  title: [suiteNameWithoutFailure, 'Test without failure'],
  state: 'passed',
  isFlaky: false,
  expectedStatus: 'passed',
  timeout: 0,
  location: { ...location, file: 'anothertestfile.ts' },
  retries: 0,
  attempts: [
    {
      _s: 'passed',
      attempt: 0,
      startTime: mockDate.toISOString(),
      steps: [],
      duration: time,
      status: 'passed',
      stdout: [],
      stderr: [],
      errors: [],
      error: undefined,
    },
  ],
};

export const testCaseNoTimestamp: TestCase = {
  name: 'Test with no timestamp',
  classname: 'Classname',
  time: '5.000',
  failure: [],
};

export const suiteNameNoTimestamp = 'No Timestamp Suite';
export const suiteNoTimestamp: TestSuite = {
  id: '3',
  name: suiteNameNoTimestamp,
  file: 'notimestampfile.ts',
};

export const instanceReportTestNoTimestamp: InstanceReportTest = {
  _t: mockDate.getTime(),
  testId: 'a2a78f84bc338268',
  title: [suiteNameNoTimestamp, 'Test with no timestamp'],
  state: 'passed',
  isFlaky: false,
  expectedStatus: 'passed',
  timeout: 0,
  location: { ...location, file: 'notimestampfile.ts' },
  retries: 0,
  attempts: [
    {
      _s: 'passed',
      attempt: 0,
      startTime: mockDate.toISOString(),
      steps: [],
      duration: time,
      status: 'passed',
      stdout: [],
      stderr: [],
      errors: [],
      error: undefined,
    },
  ],
};

export const testCaseNoTime: TestCase = {
  name: 'Test without time',
  classname: 'Classname',
  failure: [],
};

export const suiteNameNoTime = 'Test Suite with no time';
export const suiteNoTime: TestSuite = {
  id: '4',
  name: suiteNameNoTime,
  timestamp: '2024-12-28T12:00:00Z',
  file: 'notimefile.ts',
};

export const instanceReportTestNoTime: InstanceReportTest = {
  _t: mockDate.getTime(),
  testId: 'e60e3a5f75ce92fd',
  title: [suiteNameNoTime, 'Test without time'],
  state: 'passed',
  isFlaky: false,
  expectedStatus: 'passed',
  timeout: 0,
  location: { line: 1, column: 1, file: 'notimefile.ts' },
  retries: 0,
  attempts: [
    {
      _s: 'passed',
      attempt: 0,
      startTime: mockDate.toISOString(),
      steps: [],
      duration: 0,
      status: 'passed',
      stdout: [],
      stderr: [],
      errors: [],
      error: undefined,
    },
  ],
};
