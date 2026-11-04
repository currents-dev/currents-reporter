import { TestCaseResult } from '@jest/reporters';
import { jestStatusFromInvocations } from '../test';

const result = (status: string, invocations?: number) =>
  ({ status, invocations }) as TestCaseResult;

describe('jestStatusFromInvocations', () => {
  it('is failed without results', () => {
    expect(jestStatusFromInvocations([])).toBe('failed');
  });

  it('takes the status of the result with the most invocations', () => {
    expect(
      jestStatusFromInvocations([
        result('failed', 1),
        result('passed', 3),
        result('failed', 2),
      ])
    ).toBe('passed');
  });

  it('takes the first result on a tie', () => {
    expect(
      jestStatusFromInvocations([result('failed', 2), result('passed', 2)])
    ).toBe('failed');
    expect(
      jestStatusFromInvocations([result('pending'), result('passed')])
    ).toBe('pending');
  });

  it('counts a result without invocations as 0', () => {
    expect(
      jestStatusFromInvocations([result('pending'), result('passed', 1)])
    ).toBe('passed');
  });
});
