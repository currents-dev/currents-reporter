import { CommanderError } from '@commander-js/extra-typings';
import { error } from '@logger';
import { beforeEach, describe, expect, it, MockInstance, vi } from 'vitest';
import { enableDebug } from '../../debug';
import { commandHandler, parseCommaSeparatedList } from '../utils';

vi.mock('@logger', () => ({
  error: vi.fn(),
  warnWithNoTrace: vi.fn(),
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
  let exitSpy: MockInstance<never, [code?: string | number | null | undefined]>;

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
