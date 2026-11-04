import { Config } from '@jest/types';
import { getReportConfig } from '../getReportConfig';

describe('getReportConfig', () => {
  const argv = process.argv;
  afterEach(() => {
    process.argv = argv;
  });

  it('puts the Jest options apart from the positional args', () => {
    process.argv = ['node', 'jest', 'src/a.test.ts', '--ci', '--maxWorkers=2'];
    const { cliArgs } = getReportConfig({} as Config.GlobalConfig);
    expect(cliArgs.args).toEqual(['src/a.test.ts']);
    expect(cliArgs.options).toMatchObject({ ci: true, maxWorkers: '2' });
    expect(cliArgs.options).not.toHaveProperty('_');
    expect(cliArgs.options).not.toHaveProperty('$0');
  });
});
