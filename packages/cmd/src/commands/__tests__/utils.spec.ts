import { CommanderError } from '@commander-js/extra-typings';
import { error, warnWithNoTrace } from '@logger';
import { describe, expect, it, vi, beforeEach } from 'vitest';
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
  const mockAction = vi.fn();
  let mockExit = vi.spyOn(process, 'exit').mockImplementation((code) => {
    throw new Error(`process.exit(${code})`);
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should call the action and exit with code 0 on success', async () => {
    mockAction.mockResolvedValueOnce(undefined);
    // @ts-ignore
    mockExit = vi.spyOn(process, 'exit').mockImplementationOnce(() => void 0);

    await commandHandler(mockAction, { debug: false });
    expect(mockAction).toHaveBeenCalled();
    expect(mockExit).toHaveBeenCalledWith(0);
  });

  it('should enable debug mode if debug is true', async () => {
    mockAction.mockResolvedValueOnce(undefined);
    // @ts-ignore
    mockExit = vi.spyOn(process, 'exit').mockImplementationOnce(() => void 0);

    await commandHandler(mockAction, { debug: true });
    expect(enableDebug).toHaveBeenCalled();
    expect(mockAction).toHaveBeenCalled();
    expect(mockExit).toHaveBeenCalledWith(0);
  });

  it('should log error and exit with code 1 if an error occurs and failOnError is true', async () => {
    const errorMessage = 'Test error';
    mockAction.mockRejectedValueOnce(new Error(errorMessage));

    await expect(commandHandler(mockAction, { debug: false })).rejects.toThrow(
      'process.exit(1)'
    );
    expect(error).toHaveBeenCalledWith(errorMessage);
    expect(mockExit).toHaveBeenCalledWith(1);
  });

  it('should log error and exit with specific exitCode if CommanderError occurs', async () => {
    const commandError = new CommanderError(
      123,
      'commander.error',
      'Commander failed'
    );
    mockAction.mockRejectedValueOnce(commandError);

    await expect(commandHandler(mockAction, { debug: false })).rejects.toThrow(
      'process.exit(123)'
    );
    expect(error).toHaveBeenCalledWith('Commander failed');
    expect(mockExit).toHaveBeenCalledWith(123);
  });

  it('should log a warning and exit with code 0 if failOnError is false', async () => {
    const errorMessage = 'Test warning';
    mockAction.mockRejectedValueOnce(new Error(errorMessage));

    await expect(
      commandHandler(mockAction, { debug: false }, { failOnError: false })
    ).rejects.toThrow('process.exit(0)');
    expect(warnWithNoTrace).toHaveBeenCalledWith(errorMessage);
    expect(mockExit).toHaveBeenCalledWith(0);
  });
});
