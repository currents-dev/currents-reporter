import { Command, CommanderError, Option } from '@commander-js/extra-typings';
import { error, warnOnStderr } from '@logger';
import { beforeEach, describe, expect, it, MockInstance, vi } from 'vitest';
import { enableDebug } from '../../debug';
import {
  commandHandler,
  parseCommaSeparatedList,
  warnOnOverriddenEnv,
} from '../utils';

vi.mock('@logger', () => ({
  error: vi.fn(),
  warnWithNoTrace: vi.fn(),
  warnOnStderr: vi.fn(),
}));

vi.mock('../../debug', () => ({
  enableDebug: vi.fn(),
}));

describe('parseCommaSeparatedList', () => {
  it('should parse a single comma-separated value', () => {
    const result = parseCommaSeparatedList('a,b,c');
    expect(result).toEqual(['a', 'b', 'c']);
  });

  it('should trim values', () => {
    const result = parseCommaSeparatedList(' a , b , c ');
    expect(result).toEqual(['a', 'b', 'c']);
  });

  it('should concatenate with previous values', () => {
    const result = parseCommaSeparatedList('d,e', ['a', 'b', 'c']);
    expect(result).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('should return previous values if no new value is provided', () => {
    const result = parseCommaSeparatedList('', ['a', 'b', 'c']);
    expect(result).toEqual(['a', 'b', 'c']);
  });

  it('should return empty array if no value or previous is provided', () => {
    const result = parseCommaSeparatedList('');
    expect(result).toEqual([]);
  });
});

describe('commandHandler', () => {
  let exitSpy: MockInstance<never>;

  beforeEach(() => {
    vi.clearAllMocks();
    // @ts-ignore
    exitSpy = vi.spyOn(process, 'exit').mockImplementation((code) => {
      return code as never;
    });
  });

  it('should call action with the given options and exit with code 0 on success', async () => {
    const mockAction = vi.fn().mockResolvedValue(undefined);
    const mockOptions = { debug: false };

    await commandHandler(mockAction, mockOptions);
    expect(mockAction).toHaveBeenCalledWith(mockOptions);
    expect(exitSpy).toHaveBeenCalledWith(0);
  });

  it('should enable debug mode if debug option is true', async () => {
    const mockAction = vi.fn().mockResolvedValue(undefined);
    const mockOptions = { debug: true };

    await commandHandler(mockAction, mockOptions);
    expect(enableDebug).toHaveBeenCalled();
    expect(mockAction).toHaveBeenCalledWith(mockOptions);
    expect(exitSpy).toHaveBeenCalledWith(0);
  });

  it('should log an error and exit with code 1 if action throws a generic error', async () => {
    const mockAction = vi.fn().mockRejectedValue(new Error('Test Error'));
    const mockOptions = { debug: false };

    await commandHandler(mockAction, mockOptions);
    expect(error).toHaveBeenCalledWith('Test Error');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('should exit with CommanderError exitCode if action throws a CommanderError', async () => {
    const commanderError = new CommanderError(
      2,
      'commander.error',
      'Commander Error'
    );
    const mockAction = vi.fn().mockRejectedValue(commanderError);
    const mockOptions = { debug: false };

    await commandHandler(mockAction, mockOptions);
    expect(error).toHaveBeenCalledWith('Commander Error');
    expect(exitSpy).toHaveBeenCalledWith(2);
  });
});

describe('warnOnOverriddenEnv', () => {
  const parse = (args: string[]) => {
    const command = new Command()
      .exitOverride()
      .addOption(new Option('-p, --project-id <id>').env('CURRENTS_PROJECT_ID'))
      .action(() => undefined);
    command.parse(args, { from: 'user' });
    return command;
  };

  beforeEach(() => {
    vi.mocked(warnOnStderr).mockClear();
    vi.unstubAllEnvs();
  });

  it('warns when the option and its variable differ', () => {
    vi.stubEnv('CURRENTS_PROJECT_ID', 'from-env');
    warnOnOverriddenEnv(parse(['--project-id', 'from-cli']) as never);
    expect(warnOnStderr).toHaveBeenCalledWith(
      '--project-id and CURRENTS_PROJECT_ID are set to different values; using --project-id'
    );
  });

  it('does not warn when they agree or only one is set', () => {
    vi.stubEnv('CURRENTS_PROJECT_ID', 'same');
    warnOnOverriddenEnv(parse(['--project-id', 'same']) as never);
    warnOnOverriddenEnv(parse([]) as never);
    vi.stubEnv('CURRENTS_PROJECT_ID', '');
    warnOnOverriddenEnv(parse(['--project-id', 'x']) as never);
    expect(warnOnStderr).not.toHaveBeenCalled();
  });

  it('compares a single value exactly', () => {
    vi.stubEnv('CURRENTS_PROJECT_ID', 'a, b');
    warnOnOverriddenEnv(parse(['--project-id', 'a,b']) as never);
    expect(warnOnStderr).toHaveBeenCalledTimes(1);
  });

  it('compares a repeated or comma-separated option as a list', () => {
    const command = new Command()
      .exitOverride()
      .addOption(
        new Option('--tag <tag>')
          .env('CURRENTS_TAG')
          .argParser(parseCommaSeparatedList)
      )
      .action(() => undefined);
    vi.stubEnv('CURRENTS_TAG', 'tagA, tagB');
    command.parse(['--tag', 'tagA', '--tag', 'tagB'], { from: 'user' });
    warnOnOverriddenEnv(command as never);
    expect(warnOnStderr).not.toHaveBeenCalled();
  });
});
