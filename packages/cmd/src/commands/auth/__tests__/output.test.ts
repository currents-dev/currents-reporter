import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CommandFailure, ExitCode } from '../../../services/auth/result';
import { progressFor, runAccountCommand } from '../output';

let stdout: string[];
let stderr: string[];
let exitCode: number | undefined;

beforeEach(() => {
  stdout = [];
  stderr = [];
  exitCode = undefined;
  vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
    stdout.push(String(chunk));
    return true;
  });
  vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
    stderr.push(String(chunk));
    return true;
  });
  vi.spyOn(console, 'log').mockImplementation((line) => {
    stdout.push(`${line}\n`);
  });
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(process, 'exit').mockImplementation(((code: number) => {
    exitCode = code;
  }) as never);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('runAccountCommand --json', () => {
  it('prints one object with data and next steps, and exits with the result code', async () => {
    await runAccountCommand(
      async () => ({
        data: { status: 'waiting' },
        text: ['not printed'],
        nextSteps: [{ command: 'currents signup --resume', why: 'wait' }],
        exitCode: ExitCode.waitingForPerson,
      }),
      { json: true }
    );

    expect(stdout).toHaveLength(1);
    expect(JSON.parse(stdout[0])).toEqual({
      ok: true,
      data: { status: 'waiting' },
      next_steps: [{ command: 'currents signup --resume', why: 'wait' }],
    });
    expect(exitCode).toBe(2);
  });

  it('prints a failure with its code and hint', async () => {
    await runAccountCommand(
      async () => {
        throw new CommandFailure(
          'rate_limited',
          'Too many',
          ExitCode.refused,
          'Try again in 2 min.'
        );
      },
      { json: true }
    );

    expect(JSON.parse(stdout[0])).toEqual({
      ok: false,
      error: {
        code: 'rate_limited',
        message: 'Too many',
        hint: 'Try again in 2 min.',
      },
      next_steps: [],
    });
    expect(exitCode).toBe(4);
  });

  it('reports any other error as unexpected with exit code 1', async () => {
    await runAccountCommand(
      async () => {
        throw new Error('boom');
      },
      { json: true }
    );
    expect(JSON.parse(stdout[0]).error.code).toBe('unexpected');
    expect(exitCode).toBe(1);
  });
});

describe('runAccountCommand text', () => {
  it('prints the lines and the next steps', async () => {
    await runAccountCommand(
      async () => ({
        data: {},
        text: ['Logged out.'],
        nextSteps: [{ command: 'currents login', why: 'log in' }],
      }),
      { json: false }
    );
    const printed = stdout.join('');
    expect(printed).toContain('Logged out.');
    expect(printed).toContain('currents login');
    expect(exitCode).toBe(0);
  });
});

describe('text output', () => {
  it('drops control characters from server text', async () => {
    await runAccountCommand(
      async () => ({ data: {}, text: ['name\u001b[2Jcleared\u0007'] }),
      { json: false }
    );
    const printed = stdout.join('');
    expect(printed).toContain('name[2Jcleared');
    expect(printed).not.toContain('\u001b');
    expect(printed).not.toContain('\u0007');
  });
});

describe('progressFor', () => {
  it('writes JSON lines to stderr with --json, and text to stdout without', () => {
    progressFor(true)('Waiting…', { status: 'waiting', url: 'u' });
    expect(stderr).toEqual(['{"status":"waiting","url":"u"}\n']);
    expect(stdout).toEqual([]);

    progressFor(false)('Waiting…', { status: 'waiting' });
    expect(stdout.join('')).toContain('Waiting…');
  });
});
